import type { ParseResult, ParseWarning, Transaction } from "@/lib/types";
import { detectBank } from "./banks";
import { parseLines, type ExtractedLine, type RawRecord } from "./engine";
import { extractPdf } from "./pdf";
import { parseCsv } from "./csv";
import { detectKind, extractQrisMeta } from "@/lib/qris/detect";
import { classifyByRules } from "@/lib/qris/rules";

export interface ParseInput {
  fileName: string;
  bytes: Uint8Array;
}

function isPdf(fileName: string, bytes: Uint8Array): boolean {
  if (fileName.toLowerCase().endsWith(".pdf")) return true;
  // %PDF magic bytes.
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Ubah RawRecord jadi Transaction lengkap dengan klasifikasi rule-based. */
function toTransactions(records: RawRecord[], bank: ParseResult["bank"]): Transaction[] {
  return records.map((r, index) => {
    const kind = detectKind(r.description, r.direction);
    const qris = kind === "qris" ? extractQrisMeta(r.description) : undefined;
    const cls = classifyByRules(r.description, kind, r.direction);

    // Arah dana yang masih ragu ikut menurunkan keyakinan klasifikasi.
    const confidence =
      r.directionConfidence < 0.5 ? Math.min(cls.confidence, 0.5) : cls.confidence;

    return {
      id: `tx-${index}-${r.date}-${Math.round(r.amount)}`,
      date: r.date,
      description: r.description,
      amount: r.amount,
      direction: r.direction,
      balance: r.balance,
      bank,
      kind,
      qris,
      merchant: cls.merchant,
      category: cls.category,
      confidence,
      source: cls.source,
      note: cls.note,
      origin: r.origin,
      noMerchantInfo: cls.noMerchantInfo,
    };
  });
}

/**
 * Transaksi yang layak dikirim ke AI: yang belum teridentifikasi atau
 * keyakinannya rendah, TAPI keterangannya memang memuat sesuatu untuk dianalisa.
 */
export function needsAiAnalysis(t: Transaction): boolean {
  if (t.noMerchantInfo) return false;
  if (t.source === "manual" || t.source === "ai") return false;
  return t.source === "unknown" || t.confidence < 0.6;
}

export async function parseStatement(input: ParseInput): Promise<ParseResult> {
  const warnings: ParseWarning[] = [];
  const pdf = isPdf(input.fileName, input.bytes);

  let records: RawRecord[] = [];
  let lines: ExtractedLine[] = [];
  let pages: number | undefined;
  let periodStart: string | undefined;
  let periodEnd: string | undefined;
  let fullText = "";

  if (pdf) {
    const extraction = await extractPdf(input.bytes);
    lines = extraction.lines;
    pages = extraction.pages;
    fullText = lines.map((l) => l.text).join("\n");

    const { profile, confidence } = detectBank(fullText);
    const result = parseLines(lines, profile);
    records = result.records;
    warnings.push(...result.warnings);
    periodStart = result.periodStart;
    periodEnd = result.periodEnd;

    return finish({
      profileId: profile.id,
      profileLabel: profile.label,
      confidence,
      records,
      warnings,
      fileName: input.fileName,
      fileType: "pdf",
      pages,
      periodStart,
      periodEnd,
    });
  }

  // CSV / TSV / teks.
  fullText = new TextDecoder("utf-8").decode(input.bytes);
  // Buang BOM kalau ada — bikin nama kolom pertama tidak cocok.
  if (fullText.charCodeAt(0) === 0xfeff) fullText = fullText.slice(1);

  const { profile, confidence } = detectBank(fullText);
  const csv = parseCsv(fullText);
  warnings.push(...csv.warnings);
  records = csv.records;
  periodStart = csv.periodStart;
  periodEnd = csv.periodEnd;

  if (records.length === 0 && csv.fallbackLines) {
    const result = parseLines(csv.fallbackLines, profile);
    records = result.records;
    warnings.push(...result.warnings);
    periodStart = result.periodStart;
    periodEnd = result.periodEnd;
  }

  return finish({
    profileId: profile.id,
    profileLabel: profile.label,
    confidence,
    records,
    warnings,
    fileName: input.fileName,
    fileType: "csv",
    periodStart,
    periodEnd,
  });
}

function finish(args: {
  profileId: ParseResult["bank"];
  profileLabel: string;
  confidence: number;
  records: RawRecord[];
  warnings: ParseWarning[];
  fileName: string;
  fileType: "pdf" | "csv";
  pages?: number;
  periodStart?: string;
  periodEnd?: string;
}): ParseResult {
  const transactions = toTransactions(args.records, args.profileId);
  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const needsAi = transactions.filter(needsAiAnalysis).length;

  return {
    bank: args.profileId,
    bankLabel: args.profileLabel,
    bankConfidence: args.confidence,
    transactions,
    warnings: args.warnings,
    meta: {
      fileName: args.fileName,
      fileType: args.fileType,
      pages: args.pages,
      rows: transactions.length,
      needsAi,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
    },
  };
}

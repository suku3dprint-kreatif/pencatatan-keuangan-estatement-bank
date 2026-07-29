import Papa from "papaparse";
import type { Direction, ParseWarning } from "@/lib/types";
import type { ExtractedLine, RawRecord } from "./engine";
import { findDate, findPeriod, parseAmount, resolveYear } from "./primitives";
import { reconcileWithBalance } from "./engine";

/** Nama kolom yang dikenali, dari berbagai bank & hasil ekspor spreadsheet. */
const ALIASES = {
  date: [
    "tanggal", "tgl", "date", "tanggal transaksi", "transaction date", "posting date",
    "tanggal posting", "value date", "tanggal valuta", "waktu", "datetime", "trx date",
    "tanggal mutasi",
  ],
  description: [
    "keterangan", "deskripsi", "description", "uraian", "remark", "remarks", "berita",
    "catatan", "detail", "transaction detail", "narasi", "keterangan transaksi", "note",
    "nama transaksi", "transaction", "transaksi",
  ],
  debit: ["debit", "debet", "keluar", "pengeluaran", "uang keluar", "withdrawal", "dr", "out", "kas keluar"],
  credit: ["kredit", "credit", "masuk", "pemasukan", "uang masuk", "deposit", "cr", "in", "kas masuk"],
  amount: ["nominal", "jumlah", "amount", "mutasi", "nilai", "value", "total", "amount idr"],
  balance: ["saldo", "balance", "saldo akhir", "running balance", "ending balance", "sisa saldo"],
  type: ["tipe", "type", "jenis", "d/k", "dk", "dc", "arah", "direction", "debit/kredit", "cr/db"],
} as const;

type Field = keyof typeof ALIASES;

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchField(header: string): Field | null {
  const h = normalizeHeader(header);
  if (!h) return null;
  // Cocokkan persis dulu supaya "saldo" tidak keburu diklaim oleh "jumlah".
  for (const [field, names] of Object.entries(ALIASES) as [Field, readonly string[]][]) {
    if (names.includes(h)) return field;
  }
  for (const [field, names] of Object.entries(ALIASES) as [Field, readonly string[]][]) {
    if (names.some((n) => n.length >= 4 && h.includes(n))) return field;
  }
  return null;
}

interface HeaderMap {
  rowIndex: number;
  fields: Partial<Record<Field, number>>;
  score: number;
}

/**
 * Cari baris header. CSV bank sering punya beberapa baris basa-basi di atas
 * (nama pemilik, nomor rekening, periode) sebelum header sebenarnya.
 */
function findHeaderRow(rows: string[][]): HeaderMap | null {
  let best: HeaderMap | null = null;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    const fields: Partial<Record<Field, number>> = {};
    rows[i].forEach((cell, col) => {
      const field = matchField(cell);
      if (field && fields[field] === undefined) fields[field] = col;
    });
    const hasDate = fields.date !== undefined;
    const hasValue =
      fields.amount !== undefined || fields.debit !== undefined || fields.credit !== undefined;
    if (!hasDate || !hasValue) continue;
    const score = Object.keys(fields).length;
    if (!best || score > best.score) best = { rowIndex: i, fields, score };
  }
  return best;
}

function cellAmount(row: string[], col: number | undefined): number | null {
  if (col === undefined) return null;
  const raw = row[col];
  if (raw === undefined || raw.trim() === "") return null;
  return parseAmount(raw);
}

export interface CsvParseResult {
  records: RawRecord[];
  warnings: ParseWarning[];
  periodStart?: string;
  periodEnd?: string;
  /** Kalau header tidak ketemu, teks mentah diserahkan ke mesin baris. */
  fallbackLines?: ExtractedLine[];
}

/**
 * Tebak delimiter sendiri, jangan serahkan ke Papa.
 *
 * Ini penting untuk CSV bank Indonesia: nominalnya ditulis "22.000,00", jadi
 * koma desimal membuat heuristik bawaan Papa menyimpulkan delimiter-nya koma
 * dan setiap nominal terbelah dua. Karena itulah bank Indonesia justru memakai
 * ";" — dan itu yang harus kita dahulukan.
 */
export function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 25);
  if (lines.length === 0) return ",";

  const candidates = [";", "\t", "|", ","];
  let best = { delimiter: ",", score: -1 };

  for (const delimiter of candidates) {
    const counts = lines.map((l) => l.split(delimiter).length - 1).filter((c) => c > 0);
    if (counts.length === 0) continue;

    // Modus jumlah kolom: makin banyak baris yang sepakat, makin meyakinkan.
    const freq = new Map<number, number>();
    for (const c of counts) freq.set(c, (freq.get(c) ?? 0) + 1);
    const modal = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    const score = modal[1] * 10 + modal[0];

    // Urutan kandidat sudah jadi tie-break: ";" menang atas "," saat imbang.
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

export function parseCsv(text: string): CsvParseResult {
  const warnings: ParseWarning[] = [];
  const delimiter = detectDelimiter(text);
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    delimiter,
  });
  const rows = (parsed.data as string[][]).map((r) => r.map((c) => (c ?? "").toString()));

  const header = findHeaderRow(rows);
  if (!header) {
    // Tidak ada header yang dikenali: serahkan ke mesin parser berbasis baris.
    const lines: ExtractedLine[] = rows.map((r) => ({
      text: r.join(" ").replace(/\s+/g, " ").trim(),
      cells: r.map((str, col) => ({ str, x: col * 100 })),
      page: 1,
    }));
    return {
      records: [],
      warnings: [
        {
          level: "info",
          message:
            "Header kolom CSV tidak dikenali — dicoba dibaca sebagai teks biasa. Kalau hasilnya kosong, ganti nama kolom jadi Tanggal / Keterangan / Debit / Kredit / Saldo.",
        },
      ],
      fallbackLines: lines,
    };
  }

  const { fields } = header;
  const dataRows = rows.slice(header.rowIndex + 1);
  const period = findPeriod(rows.slice(0, header.rowIndex + 1).map((r) => r.join(" ")).join("\n"));

  const records: RawRecord[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const rawDate = fields.date !== undefined ? row[fields.date] : undefined;
    if (!rawDate || !rawDate.trim()) continue;
    const dateMatch = findDate(rawDate);
    if (!dateMatch) {
      skipped++;
      continue;
    }

    const description =
      (fields.description !== undefined ? row[fields.description] : "")?.trim() || "(tanpa keterangan)";

    const debit = cellAmount(row, fields.debit);
    const credit = cellAmount(row, fields.credit);
    const generic = cellAmount(row, fields.amount);
    const balance = cellAmount(row, fields.balance) ?? undefined;

    let amount: number | null = null;
    let direction: Direction = "debit";
    let directionConfidence = 0.9;

    if (debit !== null && debit !== 0) {
      amount = Math.abs(debit);
      direction = "debit";
    } else if (credit !== null && credit !== 0) {
      amount = Math.abs(credit);
      direction = "credit";
    } else if (generic !== null && generic !== 0) {
      amount = Math.abs(generic);
      const typeCell = fields.type !== undefined ? (row[fields.type] ?? "").trim().toUpperCase() : "";
      if (/^(?:C|CR|K|KR|KREDIT|CREDIT|MASUK|IN)$/.test(typeCell)) {
        direction = "credit";
      } else if (/^(?:D|DB|DR|DEBIT|DEBET|KELUAR|OUT)$/.test(typeCell)) {
        direction = "debit";
      } else if (generic > 0 && fields.type === undefined && fields.debit === undefined) {
        // Satu kolom nominal tanpa penanda: pakai tanda angkanya.
        direction = "debit";
        directionConfidence = 0.4;
      } else {
        direction = generic < 0 ? "debit" : "credit";
        directionConfidence = 0.6;
      }
      if (generic < 0) direction = "debit";
    }

    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }

    records.push({
      date: resolveYear(dateMatch.iso, period.start, period.end),
      description,
      amount,
      direction,
      balance,
      directionConfidence,
      origin: "csv",
    });
  }

  const corrected = reconcileWithBalance(records);
  if (corrected > 0) {
    warnings.push({
      level: "info",
      message: `${corrected} transaksi arah debit/kreditnya dikoreksi otomatis dari selisih saldo.`,
    });
  }
  if (skipped > 0) {
    warnings.push({
      level: "info",
      message: `${skipped} baris CSV dilewati karena tanggal atau nominalnya tidak terbaca.`,
    });
  }
  const mapped = Object.keys(fields).join(", ");
  const shownDelimiter = delimiter === "\t" ? "tab" : `"${delimiter}"`;
  warnings.push({
    level: "info",
    message: `Delimiter ${shownDelimiter}; kolom yang terpakai: ${mapped}.`,
  });

  const dates = records.map((r) => r.date).sort();
  return {
    records,
    warnings,
    periodStart: period.start ?? dates[0],
    periodEnd: period.end ?? dates[dates.length - 1],
  };
}

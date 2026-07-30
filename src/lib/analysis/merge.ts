import type { BankId, ParseResult, ParseWarning, Transaction } from "@/lib/types";
import { needsAiAnalysis } from "@/lib/parse";

export interface StatementFile {
  fileName: string;
  fileType: "pdf" | "csv";
  bank: BankId;
  bankLabel: string;
  rows: number;
  pages?: number;
  periodStart?: string;
  periodEnd?: string;
}

export interface MergedStatement {
  files: StatementFile[];
  /** Label bank gabungan; menyebut beberapa bank kalau filenya campur. */
  bankLabel: string;
  banks: BankId[];
  transactions: Transaction[];
  warnings: ParseWarning[];
  duplicatesRemoved: number;
  periodStart?: string;
  periodEnd?: string;
  needsAi: number;
  noMerchantInfo: number;
}

/**
 * Kunci identitas transaksi untuk deteksi duplikat antar-file.
 *
 * Saldo ikut jadi bagian kunci karena itulah yang membuat dua transaksi
 * benar-benar tidak mungkin tertukar: dua belanja Rp 25.000 di hari yang sama
 * tetap punya saldo berjalan yang berbeda.
 */
function identityKey(t: Transaction): string {
  const desc = t.description.toUpperCase().replace(/\s+/g, " ").trim();
  const balance = t.balance !== undefined ? t.balance.toFixed(2) : "-";
  return `${t.date}|${t.direction}|${t.amount.toFixed(2)}|${balance}|${desc}`;
}

/**
 * Gabungkan beberapa hasil parse jadi satu.
 *
 * Deduplikasi HANYA dilakukan antar-file, tidak di dalam satu file. Alasannya:
 * satu statement bisa memuat dua baris yang sah-sah saja identik (misalnya
 * pokok pembayaran dan biayanya dicatat terpisah dengan timestamp sama), dan
 * membuangnya berarti mengubah total. Sedangkan periode statement yang tumpang
 * tindih — misal file Januari dan file "Jan–Feb" — memang menghasilkan baris
 * yang sama dan harus dibuang.
 */
export function mergeStatements(results: ParseResult[]): MergedStatement {
  const files: StatementFile[] = [];
  const warnings: ParseWarning[] = [];
  const transactions: Transaction[] = [];
  const seen = new Set<string>();
  let duplicatesRemoved = 0;

  results.forEach((result, fileIndex) => {
    files.push({
      fileName: result.meta.fileName,
      fileType: result.meta.fileType,
      bank: result.bank,
      bankLabel: result.bankLabel,
      rows: result.meta.rows,
      pages: result.meta.pages,
      periodStart: result.meta.periodStart,
      periodEnd: result.meta.periodEnd,
    });

    // Peringatan diberi awalan nama file supaya jelas asalnya saat digabung.
    for (const w of result.warnings) {
      warnings.push({
        level: w.level,
        message: results.length > 1 ? `${result.meta.fileName}: ${w.message}` : w.message,
      });
    }

    const keysThisFile = new Set<string>();
    for (const tx of result.transactions) {
      const key = identityKey(tx);
      // Duplikat di dalam file yang sama dibiarkan; hanya lintas file yang dibuang.
      if (!keysThisFile.has(key) && seen.has(key)) {
        duplicatesRemoved++;
        continue;
      }
      keysThisFile.add(key);
      seen.add(key);
      transactions.push({
        ...tx,
        // ID harus unik secara global setelah digabung.
        id: `f${fileIndex}-${tx.id}`,
        sourceFile: result.meta.fileName,
      });
    }
  });

  transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const banks = [...new Set(files.map((f) => f.bank))];
  const bankLabels = [...new Set(files.map((f) => f.bankLabel))];

  if (banks.length > 1) {
    warnings.push({
      level: "warn",
      message: `File yang digabung berasal dari bank berbeda (${bankLabels.join(", ")}). Angka gabungan tetap dihitung, tapi pastikan itu memang yang kamu maksud.`,
    });
  }
  if (duplicatesRemoved > 0) {
    warnings.push({
      level: "info",
      message: `${duplicatesRemoved} transaksi ganda dibuang karena periode antar-file tumpang tindih.`,
    });
  }

  const overlaps = findOverlaps(files);
  for (const o of overlaps) {
    warnings.push({
      level: "info",
      message: `Periode ${o.a} dan ${o.b} saling tumpang tindih.`,
    });
  }

  const dates = transactions.map((t) => t.date);

  return {
    files,
    bankLabel: bankLabels.length === 1 ? bankLabels[0] : `${bankLabels.length} bank berbeda`,
    banks,
    transactions,
    warnings,
    duplicatesRemoved,
    periodStart: dates[0],
    periodEnd: dates[dates.length - 1],
    needsAi: transactions.filter(needsAiAnalysis).length,
    noMerchantInfo: transactions.filter((t) => t.noMerchantInfo).length,
  };
}

/** Pasangan file yang periodenya bertabrakan — sering tanda salah pilih file. */
function findOverlaps(files: StatementFile[]): { a: string; b: string }[] {
  const out: { a: string; b: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    for (let j = i + 1; j < files.length; j++) {
      const a = files[i];
      const b = files[j];
      if (!a.periodStart || !a.periodEnd || !b.periodStart || !b.periodEnd) continue;
      if (a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd) {
        out.push({ a: a.fileName, b: b.fileName });
      }
    }
  }
  return out;
}

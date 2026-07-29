import type { ClassificationSource, Direction, TxKind } from "@/lib/types";
import { CATEGORY_KEYWORDS, MERCHANTS } from "./dictionary";
import { extractQrisMeta, normalize } from "./detect";

export interface Classification {
  merchant?: string;
  category: string;
  confidence: number;
  source: ClassificationSource;
  note?: string;
}

/** Kategori default per jenis transaksi non-merchant. */
const KIND_CATEGORY: Partial<Record<TxKind, { category: string; merchant: string; note: string }>> = {
  withdrawal: { category: "tarik_tunai", merchant: "Tarik Tunai", note: "Terdeteksi penarikan tunai" },
  fee: { category: "biaya_admin", merchant: "Biaya Bank", note: "Terdeteksi biaya/administrasi" },
  interest: { category: "pendapatan", merchant: "Bagi Hasil / Bunga", note: "Terdeteksi bagi hasil atau bunga" },
  payroll: { category: "pendapatan", merchant: "Gaji", note: "Terdeteksi gaji/payroll" },
  topup: { category: "topup_ewallet", merchant: "Top Up", note: "Terdeteksi top up saldo" },
  transfer_out: { category: "transfer_keluar", merchant: "Transfer Keluar", note: "Terdeteksi transfer keluar" },
  transfer_in: { category: "transfer_masuk", merchant: "Transfer Masuk", note: "Terdeteksi transfer masuk" },
  card: { category: "belanja_online", merchant: "Kartu Debit/Kredit", note: "Transaksi kartu" },
  bill: { category: "tagihan", merchant: "Pembayaran Tagihan", note: "Terdeteksi pembayaran tagihan" },
};

/** Ubah "NASI GORENG PAK BUDI" jadi "Nasi Goreng Pak Budi". */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

function matchDictionary(haystack: string): { merchant: string; category: string } | null {
  for (const entry of MERCHANTS) {
    for (const key of entry.match) {
      if (haystack.includes(key)) return { merchant: entry.merchant, category: entry.category };
    }
  }
  return null;
}

function matchKeywordCategory(haystack: string): string | null {
  for (const entry of CATEGORY_KEYWORDS) {
    for (const key of entry.match) {
      if (haystack.includes(key)) return entry.category;
    }
  }
  return null;
}

/**
 * Klasifikasi tanpa AI. Mengembalikan `source: "unknown"` kalau tidak yakin —
 * itulah transaksi yang nanti dikirim ke AI analyzer.
 */
export function classifyByRules(
  description: string,
  kind: TxKind,
  direction: Direction,
): Classification {
  const n = normalize(description);

  // 1. Kamus merchant selalu diprioritaskan — paling akurat & gratis.
  const dict = matchDictionary(n);
  if (dict) {
    // Top up e-wallet vs bayar QRIS di merchant yang kebetulan e-wallet:
    // kalau jenisnya QRIS, ini pembayaran, bukan top up.
    const category =
      kind === "qris" && dict.category === "topup_ewallet" ? "makan_minum" : dict.category;
    return {
      merchant: dict.merchant,
      category,
      confidence: 0.95,
      source: "dictionary",
      note: "Cocok dengan kamus merchant",
    };
  }

  // 2. Pendapatan/biaya/transfer punya bentuk yang khas — tidak perlu AI.
  const byKind = KIND_CATEGORY[kind];
  if (byKind) {
    // Untuk transfer, coba ambil nama penerima/pengirim sebagai "merchant".
    if (kind === "transfer_out" || kind === "transfer_in") {
      const counterparty = extractCounterparty(description);
      return {
        merchant: counterparty ? titleCase(counterparty) : byKind.merchant,
        category: byKind.category,
        confidence: counterparty ? 0.8 : 0.7,
        source: "rule",
        note: byKind.note,
      };
    }
    return {
      merchant: byKind.merchant,
      category: byKind.category,
      confidence: 0.85,
      source: "rule",
      note: byKind.note,
    };
  }

  // 3. Kata kunci kategori generik.
  const keywordCategory = matchKeywordCategory(n);
  if (keywordCategory) {
    const hint = kind === "qris" ? extractQrisMeta(description).nameHint : null;
    return {
      merchant: hint ? titleCase(hint) : undefined,
      category: keywordCategory,
      confidence: 0.6,
      source: "rule",
      note: "Cocok dengan kata kunci kategori",
    };
  }

  // 4. Uang masuk tanpa petunjuk apa pun tetap lebih mungkin pendapatan.
  if (direction === "credit") {
    return {
      merchant: undefined,
      category: "pendapatan",
      confidence: 0.35,
      source: "unknown",
      note: "Uang masuk, sumber belum teridentifikasi",
    };
  }

  return {
    merchant: undefined,
    category: "lainnya",
    confidence: 0.1,
    source: "unknown",
    note: "Belum teridentifikasi",
  };
}

/**
 * Ambil nama lawan transaksi dari keterangan transfer.
 * Contoh: "TRSF E-BANKING CR 1234/FTSCY/WS95051 BUDI SANTOSO" → "BUDI SANTOSO".
 */
export function extractCounterparty(description: string): string | null {
  const n = normalize(description);
  const words = n.split(" ");
  // Ambil runtutan kata alfabetis terpanjang di bagian belakang keterangan.
  let best: string[] = [];
  let current: string[] = [];
  for (const w of words) {
    if (/^[A-Z]{2,}$/.test(w) && !isStopWord(w)) {
      current.push(w);
    } else {
      if (current.length > best.length) best = current;
      current = [];
    }
  }
  if (current.length > best.length) best = current;
  if (best.length === 0) return null;
  const name = best.join(" ");
  return name.length >= 4 ? name : null;
}

const STOP_WORDS = new Set([
  "TRSF", "TRANSFER", "TRF", "EBANKING", "BANKING", "MOBILE", "INTERNET",
  "CR", "DB", "DR", "KE", "DARI", "AN", "REF", "BIFAST", "FAST", "RTGS",
  "SKN", "LLG", "SWITCHING", "ONLINE", "BANK", "REKENING", "REK", "IDR",
  "PEMBAYARAN", "PAYMENT", "SETOR", "TARIK", "TUNAI", "KLIRING", "INCOMING",
  "OUTGOING", "FTSCY", "NBMB", "SA", "WS", "TO", "FROM", "VIA", "NOMOR",
]);

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word);
}

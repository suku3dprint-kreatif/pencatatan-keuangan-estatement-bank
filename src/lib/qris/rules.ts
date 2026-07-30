import type { ClassificationSource, Direction, TxKind } from "@/lib/types";
import { CATEGORY_KEYWORDS, MERCHANTS } from "./dictionary";
import { extractQrisMeta, normalize } from "./detect";

export interface Classification {
  merchant?: string;
  category: string;
  confidence: number;
  source: ClassificationSource;
  note?: string;
  /** Statement memang tidak memuat nama merchant — jangan kirim ke AI. */
  noMerchantInfo?: boolean;
}

/**
 * Jenis transaksi yang kategorinya sudah pasti dari strukturnya, sehingga tidak
 * boleh dikalahkan kamus merchant.
 *
 * Contoh nyata kenapa ini perlu: keterangan penarikan tunai BRImo memuat lokasi
 * ATM-nya — "Penarikan tunai di ATM - RS CONTOH SEJAHTERA via BRImo". Kamus
 * mencocokkan "RS " ke fasilitas kesehatan, sehingga tarik tunai Rp 800.000
 * terhitung sebagai belanja kesehatan. Lokasi ATM bukan merchant.
 */
const KIND_DECIDES_CATEGORY = new Set<TxKind>([
  "withdrawal", "fee", "interest", "payroll", "topup", "transfer_in", "transfer_out",
]);

/**
 * Jenis transaksi yang nama merchant-nya juga tidak boleh diambil dari kamus:
 * teks yang menempel di sana adalah lokasi ATM, nama bank tujuan, atau nama
 * pemberi kerja — bukan merchant.
 *
 * `topup` sengaja TIDAK di sini: "Top Up Shopee" memang berguna dicatat sebagai
 * merchant Shopee, hanya kategorinya yang harus tetap top up e-wallet.
 */
const KIND_IGNORES_DICTIONARY_MERCHANT = new Set<TxKind>([
  "withdrawal", "fee", "interest", "payroll", "transfer_in", "transfer_out",
]);

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
 * Apakah sisa teks setelah kode-kode dibuang benar-benar mengandung kandidat
 * nama? Butuh minimal satu kata alfabetis ≥3 huruf.
 */
export function hasNameLikeToken(hint: string | undefined): boolean {
  if (!hint) return false;
  return hint.split(/\s+/).some((w) => /^[A-Z]{3,}$/.test(w));
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

  // 0. QRIS yang keterangannya hanya berisi kode transaksi dan merchant PAN.
  //    Tidak ada nama merchant sama sekali di statement — bukan cuma sulit,
  //    tapi memang tidak ada informasinya. AI pun tidak bisa menebak apa pun
  //    dari sini, jadi jangan dikirim ke API: itu hanya buang token dan
  //    berisiko menghasilkan nama merchant karangan.
  if (kind === "qris" && !matchDictionary(n)) {
    const meta = extractQrisMeta(description);
    if (!hasNameLikeToken(meta.nameHint)) {
      return {
        merchant: "QRIS tanpa nama merchant",
        category: "lainnya",
        confidence: 0.5,
        source: "rule",
        note: "Statement tidak mencantumkan nama merchant",
        noMerchantInfo: true,
      };
    }
  }

  const dict = matchDictionary(n);
  const byKind = KIND_CATEGORY[kind];

  // 1. Jenis transaksi yang strukturnya sudah menentukan kategori didahulukan.
  //    Kamus merchant hanya boleh melengkapi nama, tidak mengubah kategori.
  if (byKind && KIND_DECIDES_CATEGORY.has(kind)) {
    const dictMerchant = KIND_IGNORES_DICTIONARY_MERCHANT.has(kind) ? undefined : dict?.merchant;
    const counterparty =
      kind === "transfer_out" || kind === "transfer_in" ? extractCounterparty(description) : null;
    const merchant = dictMerchant ?? (counterparty ? titleCase(counterparty) : byKind.merchant);
    return {
      merchant,
      category: byKind.category,
      confidence: dictMerchant || counterparty ? 0.85 : 0.8,
      source: dictMerchant ? "dictionary" : "rule",
      note: byKind.note,
    };
  }

  // 2. Kamus merchant — paling akurat & gratis.
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

  // 3. Jenis transaksi lain yang tetap punya kategori bawaan (tagihan, kartu).
  if (byKind) {
    return {
      merchant: byKind.merchant,
      category: byKind.category,
      confidence: 0.85,
      source: "rule",
      note: byKind.note,
    };
  }

  // 4. Kata kunci kategori generik.
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

  // 5. Uang masuk tanpa petunjuk apa pun tetap lebih mungkin pendapatan.
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
  // Ambil runtutan kata alfabetis terpanjang. Saat panjangnya sama, yang
  // TERAKHIR dipilih: di keterangan transfer Indonesia nama orang selalu datang
  // setelah nama bank dan nomor rekening ("... ke BANK X - 123 - Sari Wulandari").
  let best: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length >= best.length) best = current;
    current = [];
  };
  for (const w of words) {
    if (/^[A-Z]{2,}$/.test(w) && !isStopWord(w)) {
      current.push(w);
    } else {
      flush();
    }
  }
  flush();
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
  // Kanal & kode teknis BRImo.
  "BFST", "BRIVA", "BRIMO", "ESB", "EJLN", "BAPE", "QRIS", "QRISRNS",
  // Nama bank. Tanpa ini, "Transfer ke BANK SYARIAH MANDIRI - 123 - Sari
  // Wulandari" menghasilkan lawan transaksi "Syariah Mandiri", bukan orangnya.
  "SYARIAH", "MANDIRI", "CENTRAL", "ASIA", "NEGARA", "RAKYAT", "PERSERO",
  "TBK", "PT", "CV", "BCA", "BNI", "BRI", "BSI", "BTN", "PERMATA", "DANAMON",
  "CIMB", "NIAGA", "MEGA", "PANIN", "OCBC", "MAYBANK", "JAGO", "SEABANK",
  "NEO", "COMMERCE", "BUKOPIN", "MUAMALAT", "JENIUS", "BLU", "DIGITAL",
]);

function isStopWord(word: string): boolean {
  return STOP_WORDS.has(word);
}

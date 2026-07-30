export type BankId =
  | "bsi"
  | "mandiri"
  | "bri"
  | "bni"
  | "bca"
  | "jago"
  | "seabank"
  | "blu"
  | "neo"
  | "generic";

export type Direction = "debit" | "credit";

/** Dari mana label merchant + kategori sebuah transaksi berasal. */
export type ClassificationSource = "dictionary" | "rule" | "ai" | "manual" | "unknown";

export type TxKind =
  | "qris"
  | "transfer_out"
  | "transfer_in"
  | "topup"
  | "withdrawal"
  | "fee"
  | "interest"
  | "payroll"
  | "bill"
  | "card"
  | "other";

export interface QrisMeta {
  /** National Merchant ID, format ID + 13–15 digit. */
  nmid?: string;
  /**
   * Merchant PAN QRIS (936 + 12–16 digit). Perlu diketahui: sebagian bank
   * mencantumkan PAN penyelenggara/acquirer di sini, bukan PAN merchant-nya,
   * jadi nilai yang sama bisa muncul di banyak transaksi berbeda.
   */
  mpan?: string;
  terminalId?: string;
  /** Reference Retrieval Number / nomor referensi panjang. */
  reference?: string;
  /** Acquirer / issuer yang kebaca di keterangan (GOPAY, OVO, DANA, ...). */
  acquirer?: string;
  /** Sisa teks setelah kode-kode dibuang — kandidat nama merchant. */
  nameHint?: string;
}

export interface Transaction {
  id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Keterangan mentah dari e-statement, apa adanya. */
  description: string;
  amount: number;
  direction: Direction;
  balance?: number;
  bank: BankId;
  kind: TxKind;
  qris?: QrisMeta;
  merchant?: string;
  category: string;
  confidence: number;
  source: ClassificationSource;
  /** Catatan singkat kenapa dikategorikan begitu (dipakai AI + rule). */
  note?: string;
  /** Nomor halaman / baris asal, untuk debugging parser. */
  origin?: string;
  /** Nama file statement asalnya — relevan saat menggabungkan beberapa file. */
  sourceFile?: string;
  /**
   * Keterangan di statement memang tidak memuat nama merchant sama sekali,
   * hanya kode transaksi dan merchant PAN. Ini bukan "belum dianalisa" — tidak
   * ada yang bisa dianalisa, jadi transaksi ini tidak dikirim ke AI.
   */
  noMerchantInfo?: boolean;
}

export interface ParseWarning {
  level: "info" | "warn";
  message: string;
}

export interface ParseResult {
  bank: BankId;
  bankLabel: string;
  /** Seberapa yakin deteksi banknya (0–1). */
  bankConfidence: number;
  transactions: Transaction[];
  warnings: ParseWarning[];
  meta: {
    fileName: string;
    fileType: "pdf" | "csv";
    pages?: number;
    rows: number;
    /** Berapa transaksi yang masih butuh AI untuk ditebak merchant-nya. */
    needsAi: number;
    periodStart?: string;
    periodEnd?: string;
  };
}

export interface EnrichItem {
  id: string;
  description: string;
  amount: number;
  date: string;
  direction: Direction;
  qris?: QrisMeta;
}

export interface EnrichResult {
  id: string;
  merchant: string;
  category: string;
  confidence: number;
  note?: string;
}

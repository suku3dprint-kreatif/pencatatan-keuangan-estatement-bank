import type { BankId } from "@/lib/types";

export interface BankProfile {
  id: BankId;
  label: string;
  /** Pola untuk mendeteksi bank dari halaman pertama statement. */
  signatures: RegExp[];
  /** Baris yang bukan transaksi (header, footer, subtotal, disclaimer). */
  skip: RegExp[];
  /** Pola header kolom, untuk memetakan posisi x → debit/kredit/saldo. */
  columns: {
    debit: RegExp;
    credit: RegExp;
    balance: RegExp;
    amount?: RegExp;
  };
  /** Penanda arah dana yang menempel di baris transaksi. */
  markers?: { debit: RegExp; credit: RegExp };
}

/** Baris non-transaksi yang muncul di hampir semua bank. */
const COMMON_SKIP: RegExp[] = [
  /^\s*$/,
  /\bhalaman\b|\bpage\b\s*\d/i,
  /\bbersambung\b|\bcontinued\b/i,
  /\bsaldo\s?awal\b|\bopening\s?balance\b/i,
  /\bsaldo\s?akhir\b|\bclosing\s?balance\b|\bending\s?balance\b/i,
  /\btotal\s?(?:debet|debit|kredit|credit|mutasi|transaksi)\b/i,
  /\bmutasi\s?(?:debet|debit|kredit|credit)\b\s*:?\s*$/i,
  /\bwww\.|\bhttps?:\/\//i,
  /\bcall\s?center\b|\bhalo\b\s?\d|\b14\d{3}\b/i,
  /^\s*(?:tanggal|tgl|date)\b.*\b(?:keterangan|description|uraian|remark)\b/i,
  /\bdicetak\b|\bprinted\b|\bdокумен\b/i,
  /\bini\s+adalah\b|\bdokumen\s+ini\b|\bbukan\s+bukti\b/i,
  /\bnama\s*:|\balamat\s*:|\bno\.?\s?rekening\s*:|\bperiode\s*:/i,
  /\bmata\s?uang\b|\bcurrency\b\s*:/i,
];

const COMMON_COLUMNS = {
  debit: /\b(?:debet|debit|keluar|pengeluaran|withdrawal|dr)\b/i,
  credit: /\b(?:kredit|credit|masuk|pemasukan|deposit|cr)\b/i,
  balance: /\b(?:saldo|balance)\b/i,
  amount: /\b(?:mutasi|nominal|jumlah|amount|nilai)\b/i,
};

const COMMON_MARKERS = {
  debit: /(?:^|\s)(?:DB|DR|D)(?=\s|$)/,
  credit: /(?:^|\s)(?:CR|KR|K)(?=\s|$)/,
};

export const BANK_PROFILES: BankProfile[] = [
  {
    id: "bsi",
    label: "Bank Syariah Indonesia (BSI)",
    signatures: [
      /bank\s?syariah\s?indonesia/i,
      /\bBSI\b/,
      /bsi\s?mobile/i,
      /\bnisbah\b/i,
      /\bbagi\s?hasil\b/i,
    ],
    skip: [...COMMON_SKIP, /\bnisbah\b.*\bbagi\s?hasil\b/i],
    columns: COMMON_COLUMNS,
    markers: COMMON_MARKERS,
  },
  {
    id: "mandiri",
    label: "Bank Mandiri / Livin'",
    signatures: [
      /bank\s?mandiri/i,
      /\blivin'?\b/i,
      /mandiri\s?online/i,
      /rekening\s?koran/i,
      /\bposting\s?date\b/i,
    ],
    skip: [...COMMON_SKIP, /^\s*posting\s?date\b/i],
    columns: {
      ...COMMON_COLUMNS,
      debit: /\b(?:debet|debit|withdrawal|dr)\b/i,
      credit: /\b(?:kredit|credit|deposit|cr)\b/i,
    },
    markers: COMMON_MARKERS,
  },
  {
    id: "bri",
    label: "Bank BRI / BRImo",
    signatures: [
      /bank\s?rakyat\s?indonesia/i,
      /\bBRImo\b/i,
      /\bBRI\b/,
      /\bbrizzi\b/i,
    ],
    skip: COMMON_SKIP,
    columns: COMMON_COLUMNS,
    markers: COMMON_MARKERS,
  },
  {
    id: "bni",
    label: "Bank BNI",
    signatures: [
      /bank\s?negara\s?indonesia/i,
      /\bBNI\s?mobile\b/i,
      /\bBNI\b/,
      /\btapcash\b/i,
    ],
    skip: COMMON_SKIP,
    columns: COMMON_COLUMNS,
    markers: COMMON_MARKERS,
  },
  {
    id: "bca",
    label: "Bank BCA",
    signatures: [/bank\s?central\s?asia/i, /\bklikbca\b/i, /\bBCA\b/, /\bflazz\b/i],
    skip: [...COMMON_SKIP, /^\s*CBG\b/i],
    columns: COMMON_COLUMNS,
    // BCA menandai mutasi keluar dengan "DB" di kanan nominal.
    markers: { debit: /(?:^|\s)DB(?=\s|$)/, credit: /(?:^|\s)CR(?=\s|$)/ },
  },
  {
    id: "jago",
    label: "Bank Jago",
    signatures: [/bank\s?jago/i, /\bjago\b/i, /\bkantong\b/i],
    skip: COMMON_SKIP,
    columns: COMMON_COLUMNS,
    markers: COMMON_MARKERS,
  },
  {
    id: "seabank",
    label: "SeaBank",
    signatures: [/\bseabank\b/i, /sea\s?bank/i],
    skip: COMMON_SKIP,
    columns: COMMON_COLUMNS,
    markers: COMMON_MARKERS,
  },
  {
    id: "blu",
    label: "blu by BCA Digital",
    signatures: [/blu\s?by\s?bca/i, /bca\s?digital/i, /\bbluAccount\b/i, /\bblu\b/i],
    skip: COMMON_SKIP,
    columns: COMMON_COLUMNS,
    markers: COMMON_MARKERS,
  },
  {
    id: "neo",
    label: "Bank Neo Commerce",
    signatures: [/neo\s?commerce/i, /\bneobank\b/i, /\bneo\+\b/i],
    skip: COMMON_SKIP,
    columns: COMMON_COLUMNS,
    markers: COMMON_MARKERS,
  },
];

export const GENERIC_PROFILE: BankProfile = {
  id: "generic",
  label: "Bank (format umum)",
  signatures: [],
  skip: COMMON_SKIP,
  columns: COMMON_COLUMNS,
  markers: COMMON_MARKERS,
};

export function getProfile(id: BankId): BankProfile {
  return BANK_PROFILES.find((p) => p.id === id) ?? GENERIC_PROFILE;
}

/**
 * Tebak bank dari teks statement. Skor = jumlah signature yang cocok, dengan
 * bobot lebih tinggi untuk pola yang panjang (nama bank lengkap) supaya tidak
 * kalah oleh singkatan tiga huruf yang kebetulan muncul.
 */
export function detectBank(text: string): { profile: BankProfile; confidence: number } {
  const head = text.slice(0, 6000);
  let best: { profile: BankProfile; score: number } = { profile: GENERIC_PROFILE, score: 0 };

  for (const profile of BANK_PROFILES) {
    let score = 0;
    for (const sig of profile.signatures) {
      if (!sig.test(head)) continue;
      // Pola panjang jauh lebih meyakinkan daripada singkatan.
      score += sig.source.length > 12 ? 3 : 1;
    }
    if (score > best.score) best = { profile, score };
  }

  if (best.score === 0) return { profile: GENERIC_PROFILE, confidence: 0 };
  return { profile: best.profile, confidence: Math.min(1, best.score / 5) };
}

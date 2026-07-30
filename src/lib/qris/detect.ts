import type { Direction, QrisMeta, TxKind } from "@/lib/types";

/** Normalisasi keterangan: huruf besar, tanda baca jadi spasi, spasi dirapikan. */
export function normalize(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9\s.*/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const QRIS_MARKERS = [
  /\bQRIS\b/,
  // BRImo menempelkan kode langsung ke prefiksnya: "QRISRNS119003178520",
  // "QRIS119026531635" — tanpa spasi, jadi \bQRIS\b tidak pernah cocok.
  /\bQRIS[A-Z]{0,4}\d{6,}/,
  /\bQR\s?PAY(?:MENT)?\b/,
  /\bQRC\b/,
  /\bQR\s?-\s?\d/,
  /\bQR\s+\d{4,}/,
  /\bBAYAR\s+QR\b/,
  /\bQR\s?CODE\b/,
  /\bNMID\b/,
  /\bMERCHANT\s?(?:ID|PAY)\b/,
  // Merchant PAN QRIS Indonesia selalu berawalan 936 dan panjang 15–19 digit.
  // Kehadirannya sendiri sudah menandakan transaksi QRIS, walau kata "QRIS"
  // tidak tertulis (BRImo memakai kode transaksi seperti "456042#..." ).
  MPAN_PATTERN(),
];

/** Merchant PAN QRIS: 936 + 12–16 digit. */
function MPAN_PATTERN(): RegExp {
  return /\b936\d{12,16}\b/;
}

/** Acquirer / penyelenggara yang sering muncul di keterangan QRIS. */
const ACQUIRERS = [
  "GOPAY",
  "OVO",
  "DANA",
  "SHOPEEPAY",
  "LINKAJA",
  "NOBU",
  "ESPAY",
  "NETZME",
  "MOTIONPAY",
  "DOKU",
  "MIDTRANS",
  "XENDIT",
  "WINPAY",
  "SPIN",
];

/**
 * Token sampah yang tidak informatif untuk nama merchant. Dibuang sebelum
 * sisa teks dipakai sebagai `nameHint`.
 */
const NOISE_TOKENS = new Set([
  "QRIS", "QR", "QRC", "QRCODE", "NMID", "TID", "MID", "MPAN", "CPAN",
  "PAYMENT", "PAY", "BAYAR", "PEMBAYARAN", "PURCHASE", "TRX", "TRANSAKSI",
  "DEBIT", "KREDIT", "CREDIT", "DB", "CR", "TRSF", "TRANSFER", "TRF",
  "EBANKING", "E", "BANKING", "MOBILE", "INTERNET", "IB", "MB", "SWITCHING",
  "BIFAST", "BI", "FAST", "ONLINE", "REALTIME", "RTGS", "SKN", "LLG",
  "TO", "FROM", "KE", "DARI", "AN", "A", "N", "REF", "NO", "SEQ", "BATCH",
  "MERCHANT", "TERMINAL", "ACQUIRER", "ISSUER", "SETTLEMENT", "IDR", "RP",
  "INDONESIA", "ID", "JAKARTA", "TANGERANG", "BEKASI", "DEPOK", "BOGOR",
  "BANDUNG", "SURABAYA", "SEMARANG", "YOGYAKARTA", "MEDAN", "MAKASSAR",
  "KOTA", "KAB", "KABUPATEN", "PUSAT", "SELATAN", "UTARA", "TIMUR", "BARAT",
  // Token teknis kanal BRImo. Tanpa ini, keterangan QRIS yang isinya cuma kode
  // menyisakan "ESB NBMB" dan terlihat seolah ada nama merchant.
  "ESB", "NBMB", "NBMBA", "BAPE", "EJLN", "ATM0", "ATM1", "BRIVA", "BFST",
  "QRISRNS", "RNS", "PRA", "VIA", "BRIMO", "BRI", "CABANG", "CAB", "UNIT",
]);

export function isQris(description: string): boolean {
  const n = normalize(description);
  return QRIS_MARKERS.some((re) => re.test(n));
}

/** Pecah metadata teknis QRIS dari keterangan mentah. */
export function extractQrisMeta(description: string): QrisMeta {
  const n = normalize(description);
  const meta: QrisMeta = {};

  const nmid = /\bID\s?(\d{13,15})\b/.exec(n);
  if (nmid) meta.nmid = `ID${nmid[1]}`;

  const mpan = MPAN_PATTERN().exec(n);
  if (mpan) meta.mpan = mpan[0];

  const tid = /\b(?:TID|TERMINAL)\s?:?\s?([A-Z0-9]{6,})\b/.exec(n);
  if (tid) meta.terminalId = tid[1];
  else {
    const a0 = /\b(A0\d{6,})\b/.exec(n);
    if (a0) meta.terminalId = a0[1];
  }

  const ref = /\b(\d{12,})\b/.exec(n);
  if (ref && ref[1] !== meta.nmid?.slice(2)) meta.reference = ref[1];

  meta.acquirer = ACQUIRERS.find((a) => n.includes(a));

  // Sisa token alfabetis = kandidat nama merchant.
  const words = n.split(" ").filter((w) => {
    if (!w) return false;
    if (NOISE_TOKENS.has(w)) return false;
    // Nama acquirer sudah punya field sendiri; kalau dibiarkan di sini,
    // nama merchant jadi "Gopay Wrg Mkn Bu Sri".
    if (w === meta.acquirer) return false;
    if (/^\d+$/.test(w)) return false;
    // Buang token campur angka yang panjang (kode referensi).
    if (/\d/.test(w) && w.length > 5) return false;
    if (w.length < 2) return false;
    return true;
  });
  const hint = words.join(" ").trim();
  if (hint) meta.nameHint = hint;

  return meta;
}

const KIND_RULES: { re: RegExp; kind: TxKind; direction?: Direction }[] = [
  { re: /\bTARIK\s?TUNAI\b|\bATM\s?WITHDRAW|\bCASH\s?WITHDRAWAL\b|\bPENARIKAN\b|\bTUNAI\s?ATM\b/, kind: "withdrawal" },
  { re: /\bSETOR(?:AN)?\s?TUNAI\b|\bCASH\s?DEPOSIT\b/, kind: "topup" },
  { re: /\bTOP\s?UP\b|\bTOPUP\b|\bISI\s?SALDO\b/, kind: "topup" },
  { re: /\bGAJI\b|\bPAYROLL\b|\bSALARY\b|\bTHR\b/, kind: "payroll", direction: "credit" },
  { re: /\bBAGI\s?HASIL\b|\bBUNGA\b|\bINTEREST\b|\bNISBAH\b/, kind: "interest", direction: "credit" },
  // "BIAYA" polos ikut dihitung: BRImo memakai "BIAYA Request Kartu",
  // "Admin Fee", dan "Monthly Fee ATM".
  { re: /\bBIAYA\b|\bADMIN\s?FEE\b|\bFEE\b|\bPAJAK\b|\bTAX\b|\bDENDA\b|\bMATERAI\b/, kind: "fee" },
  // BRIVA = virtual account BRI; PLN-PRA = token listrik prabayar.
  { re: /\bPEMBAYARAN\s?TAGIHAN\b|\bBILL\s?PAYMENT\b|\bTAGIHAN\b|\bVA\s?\d|\bVIRTUAL\s?ACCOUNT\b|\bBRIVA\b|\bPLN-?PRA\b/, kind: "bill" },
  { re: /\bKARTU\s?KREDIT\b|\bCREDIT\s?CARD\b|\bDEBIT\s?CARD\b|\bEDC\b/, kind: "card" },
  // BFST = BI-Fast di BRImo. Tanda hubung ikut ditoleransi karena normalisasi
  // mempertahankannya ("BI-FAST").
  {
    re: /\bTRSF\b|\bTRANSFER\b|\bTRF\b|\bBFST\b|\bBI[\s-]?FAST\b|\bBIFAST\b|\bRTGS\b|\bSKN\b|\bLLG\b|\bKIRIM(?:AN)?\s?UANG\b/,
    kind: "transfer_out",
  },
];

/** Tentukan jenis transaksi dari keterangan + arah dana. */
export function detectKind(description: string, direction: Direction): TxKind {
  const n = normalize(description);
  if (isQris(n)) return "qris";

  for (const rule of KIND_RULES) {
    if (!rule.re.test(n)) continue;
    if (rule.direction && rule.direction !== direction) continue;
    if (rule.kind === "transfer_out") return direction === "credit" ? "transfer_in" : "transfer_out";
    return rule.kind;
  }
  return "other";
}

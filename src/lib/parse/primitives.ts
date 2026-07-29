/**
 * Parser angka & tanggal untuk format e-statement bank Indonesia.
 *
 * Masalahnya: satu file bisa campur "1.234.567,89" (ID) dan "1,234,567.89" (EN),
 * dan tanggal bisa "05/01/26", "05-01-2026", "05 Jan 2026", atau "2026-01-05".
 * Semua helper di sini pure supaya gampang di-tes.
 */

const ID_MONTHS: Record<string, number> = {
  jan: 1, januari: 1,
  feb: 2, februari: 2, peb: 2, pebruari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
};

/**
 * Token yang bentuknya mirip nominal uang. Cabang bergolongan-ribuan ditaruh
 * lebih dulu supaya "1.234.567,89" tidak kepotong jadi "1.234".
 */
export const AMOUNT_TOKEN =
  /-?\(?(?:\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\)?-?/g;

/**
 * Ubah token angka jadi number, mendeteksi sendiri mana pemisah ribuan dan
 * mana pemisah desimal. Mengembalikan null kalau bukan angka.
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;

  // Tanda negatif bisa di depan, di belakang, atau pakai kurung akuntansi.
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  s = s.replace(/^(?:Rp|IDR)\.?\s*/i, "").replace(/\s+/g, "");
  if (!/^[\d.,]+$/.test(s)) return null;
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let decimalSep = "";

  if (lastDot >= 0 && lastComma >= 0) {
    // Dua-duanya ada: yang paling belakang adalah pemisah desimal.
    decimalSep = lastDot > lastComma ? "." : ",";
  } else if (lastComma >= 0) {
    // Satu koma dengan tepat 3 digit di belakang = pemisah ribuan gaya EN
    // ("1,234"); selain itu koma adalah desimal ("1234,56").
    const single = (s.match(/,/g) ?? []).length === 1;
    decimalSep = single && s.length - lastComma - 1 !== 3 ? "," : "";
  } else if (lastDot >= 0) {
    const single = (s.match(/\./g) ?? []).length === 1;
    decimalSep = single && s.length - lastDot - 1 !== 3 ? "." : "";
  }

  let intPart: string;
  let fracPart = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  } else {
    intPart = s;
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!intPart) intPart = "0";
  if (!/^\d+$/.test(intPart) || (fracPart && !/^\d+$/.test(fracPart))) return null;

  const value = Number(`${intPart}.${fracPart || "0"}`);
  if (!Number.isFinite(value)) return null;
  return negative ? -value : value;
}

function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let y = year;
  if (y < 100) y += y > 70 ? 1900 : 2000;
  if (y < 1990 || y > 2100) return null;
  const d = new Date(Date.UTC(y, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${y.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface DateMatch {
  iso: string;
  /** Teks tanggal yang cocok, supaya bisa dipotong dari deskripsi. */
  raw: string;
  index: number;
}

const DATE_PATTERNS: { re: RegExp; build: (m: RegExpExecArray) => string | null }[] = [
  // 2026-01-05 / 2026/01/05
  {
    re: /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/,
    build: (m) => toIso(+m[1], +m[2], +m[3]),
  },
  // 05/01/2026, 05-01-26, 05.01.2026  (hari dulu — konvensi Indonesia)
  {
    re: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/,
    build: (m) => toIso(+m[3], +m[2], +m[1]),
  },
  // 05 Jan 2026 / 5 Januari 2026
  {
    re: /\b(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{2,4})\b/,
    build: (m) => {
      const mo = ID_MONTHS[m[2].toLowerCase()];
      return mo ? toIso(+m[3], mo, +m[1]) : null;
    },
  },
  // 05 JAN (tanpa tahun) — tahun diisi belakangan dari periode statement.
  {
    re: /\b(\d{1,2})[\s-]([A-Za-z]{3})\b/,
    build: (m) => {
      const mo = ID_MONTHS[m[2].toLowerCase()];
      return mo ? `????-${String(mo).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}` : null;
    },
  },
  // 05/01 (BCA: tanggal tanpa tahun)
  {
    re: /^\s*(\d{1,2})\/(\d{1,2})(?!\d|[/.])/,
    build: (m) => {
      const day = +m[1];
      const mo = +m[2];
      if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
      return `????-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    },
  },
];

/** Cari tanggal pertama di sebuah teks. Tahun bisa "????" kalau tak tercantum. */
export function findDate(text: string): DateMatch | null {
  for (const { re, build } of DATE_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    const iso = build(m);
    if (iso) return { iso, raw: m[0], index: m.index };
  }
  return null;
}

/** Tanggal yang dipakai untuk menandai awal baris transaksi (harus di kolom kiri). */
export function findLeadingDate(text: string): DateMatch | null {
  const head = text.slice(0, 24);
  const m = findDate(head);
  if (!m) return null;
  // Toleransi sedikit spasi/indentasi di depan.
  return m.index <= 4 ? m : null;
}

/**
 * Lengkapi tahun untuk tanggal "????-MM-DD" memakai rentang periode statement.
 * Kalau periode tidak diketahui, pakai tahun berjalan.
 */
export function resolveYear(iso: string, periodStart?: string, periodEnd?: string): string {
  if (!iso.startsWith("????")) return iso;
  const mmdd = iso.slice(5);
  const candidates: number[] = [];
  const startYear = periodStart ? Number(periodStart.slice(0, 4)) : NaN;
  const endYear = periodEnd ? Number(periodEnd.slice(0, 4)) : NaN;
  if (Number.isFinite(startYear)) candidates.push(startYear);
  if (Number.isFinite(endYear) && endYear !== startYear) candidates.push(endYear);
  if (candidates.length === 0) candidates.push(new Date().getUTCFullYear());

  for (const y of candidates) {
    const cand = `${y}-${mmdd}`;
    if (periodStart && cand < periodStart) continue;
    if (periodEnd && cand > periodEnd) continue;
    return cand;
  }
  return `${candidates[0]}-${mmdd}`;
}

/** Ambil rentang periode dari teks header statement, kalau ada. */
export function findPeriod(text: string): { start?: string; end?: string } {
  const window = text.slice(0, 4000);
  const re =
    /(\d{1,2}[-/.\s][A-Za-z0-9]{1,9}[-/.\s]\d{2,4})\s*(?:s\/d|s\.d\.|sd|-|–|to|hingga|sampai)\s*(\d{1,2}[-/.\s][A-Za-z0-9]{1,9}[-/.\s]\d{2,4})/i;
  const m = re.exec(window);
  if (m) {
    const a = findDate(m[1]);
    const b = findDate(m[2]);
    if (a && b && !a.iso.startsWith("????") && !b.iso.startsWith("????")) {
      return { start: a.iso <= b.iso ? a.iso : b.iso, end: a.iso <= b.iso ? b.iso : a.iso };
    }
  }
  // Fallback: "PERIODE : JANUARI 2026" / "Periode Jan 2026"
  const m2 = /periode\s*:?\s*([A-Za-z]{3,9})\s*(\d{4})/i.exec(window);
  if (m2) {
    const mo = ID_MONTHS[m2[1].toLowerCase()];
    const year = Number(m2[2]);
    if (mo && Number.isFinite(year)) {
      const last = new Date(Date.UTC(year, mo, 0)).getUTCDate();
      return {
        start: toIso(year, mo, 1) ?? undefined,
        end: toIso(year, mo, last) ?? undefined,
      };
    }
  }
  return {};
}

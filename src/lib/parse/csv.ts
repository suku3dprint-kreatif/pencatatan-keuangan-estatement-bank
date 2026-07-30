import Papa from "papaparse";
import type { Direction, ParseWarning } from "@/lib/types";
import type { ExtractedLine, RawRecord } from "./engine";
import { findDate, findPeriod, parseAmount, resolveYear } from "./primitives";
import { reconcileWithBalance } from "./engine";

/**
 * Nama kolom yang dikenali, dari berbagai bank & hasil ekspor spreadsheet.
 *
 * `remark` sengaja dipisah dari `description`: ekspor BRImo punya DESK_TRAN
 * (kode teknis) dan REMARK_CUSTOM (keterangan versi manusia, mis. "Pembayaran
 * QRIS FAMILYMART CONTOH RAYA"). Yang kedua jauh lebih berguna untuk
 * mengenali merchant, jadi keduanya diambil dan digabung.
 */
const ALIASES = {
  date: [
    "tanggal", "tgl", "date", "tanggal transaksi", "tgl transaksi", "tgl tran",
    "transaction date", "posting date", "tanggal posting", "value date",
    "tanggal valuta", "waktu", "datetime", "trx date", "tanggal mutasi",
  ],
  debit: [
    "debit", "debet", "keluar", "pengeluaran", "uang keluar", "withdrawal", "dr",
    "out", "kas keluar", "mutasi debet", "mutasi debit",
  ],
  credit: [
    "kredit", "credit", "masuk", "pemasukan", "uang masuk", "deposit", "cr", "in",
    "kas masuk", "mutasi kredit", "mutasi credit",
  ],
  balance: [
    "saldo", "balance", "saldo akhir", "saldo akhir mutasi", "running balance",
    "ending balance", "sisa saldo",
  ],
  remark: ["remark", "remarks", "remark custom", "keterangan tambahan", "catatan", "berita"],
  description: [
    "keterangan", "deskripsi", "description", "desk", "desk tran", "uraian",
    "detail", "transaction detail", "narasi", "keterangan transaksi",
    "deskripsi transaksi", "nama transaksi", "transaction", "transaksi", "note",
  ],
  type: ["tipe", "type", "jenis", "d/k", "dk", "dc", "arah", "direction", "debit/kredit", "cr/db", "glsign", "gl sign"],
  amount: ["nominal", "jumlah", "amount", "mutasi", "nilai", "value", "total", "amount idr"],
} as const;

/**
 * Urutan prioritas saat satu nama kolom cocok ke beberapa field dengan skor
 * sama. `amount` ditaruh paling akhir supaya "MUTASI_DEBET" jadi kolom debet
 * (bukan kolom nominal generik), dan "SALDO_AKHIR_MUTASI" jadi kolom saldo.
 */
const FIELD_PRIORITY = [
  "date", "debit", "credit", "balance", "remark", "description", "type", "amount",
] as const;

type Field = keyof typeof ALIASES;

/**
 * Kolom yang harus diabaikan sama sekali. "SALDO_AWAL_MUTASI" adalah saldo
 * SEBELUM transaksi — kalau ini yang terambil sebagai kolom saldo, rekonsiliasi
 * arah dana dan grafik saldo jadi bergeser satu baris.
 */
const REJECT_TOKENS = new Set(["awal", "opening", "sebelum", "previous", "beginning"]);

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cocokkan satu nama kolom ke field. Tiga tingkat kecocokan, dari yang paling
 * meyakinkan: seluruh nama sama persis, satu kata utuh sama persis, lalu
 * substring. Pencocokan per kata inilah yang membuat "TGL_TRAN" terbaca sebagai
 * kolom tanggal — dulu gagal karena "tgl" terlalu pendek untuk dicocokkan
 * sebagai substring.
 */
export function matchField(header: string): Field | null {
  const h = normalizeHeader(header);
  if (!h) return null;

  const tokens = h.split(" ");
  if (tokens.some((t) => REJECT_TOKENS.has(t))) return null;

  let best: { field: Field; score: number } | null = null;
  for (const field of FIELD_PRIORITY) {
    const names = ALIASES[field] as readonly string[];
    let score = 0;
    if (names.includes(h)) score = 3;
    else if (tokens.some((t) => names.includes(t))) score = 2;
    else if (names.some((n) => n.length >= 5 && h.includes(n))) score = 1;

    // Skor sama → field yang lebih dulu di FIELD_PRIORITY menang.
    if (score > 0 && (best === null || score > best.score)) {
      best = { field, score };
    }
  }
  return best?.field ?? null;
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
      // Kolom pertama yang cocok yang dipakai: di ekspor BRImo, TGL_TRAN datang
      // sebelum TGL_EFEKTIF, dan yang pertama itulah tanggal transaksinya.
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

/** Hanya huruf, untuk membandingkan "isi informasi" dua keterangan. */
function letters(s: string): string {
  return s.toUpperCase().replace(/[^A-Z ]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Gabungkan keterangan teknis dan keterangan versi manusia.
 *
 * Di ekspor BRImo, REMARK_CUSTOM kadang berisi nama merchant yang tidak ada di
 * DESK_TRAN ("Pembayaran QRIS FAMILYMART CONTOH RAYA"), tapi seringkali cuma
 * mengulang kode yang sama. Kalau memang mengulang, jangan digandakan.
 * Kalau berbeda, keduanya dipakai: nama merchant untuk klasifikasi, kode teknis
 * supaya NMID/MPAN tetap bisa diekstrak.
 */
export function mergeDescription(desc: string, remark: string): string {
  const d = desc.trim();
  const r = remark.trim();
  if (!r) return d;
  if (!d) return r;
  const dl = letters(d);
  const rl = letters(r);
  if (!rl || rl === dl || dl.includes(rl)) return d;
  return `${r} · ${d}`;
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

export interface CsvParseResult {
  records: RawRecord[];
  warnings: ParseWarning[];
  periodStart?: string;
  periodEnd?: string;
  /** Kalau header tidak ketemu, teks mentah diserahkan ke mesin baris. */
  fallbackLines?: ExtractedLine[];
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

    const desc = fields.description !== undefined ? (row[fields.description] ?? "") : "";
    const remark = fields.remark !== undefined ? (row[fields.remark] ?? "") : "";
    const description = mergeDescription(desc, remark) || "(tanpa keterangan)";

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

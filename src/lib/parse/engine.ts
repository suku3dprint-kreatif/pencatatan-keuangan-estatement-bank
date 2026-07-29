import type { Direction, ParseWarning } from "@/lib/types";
import type { BankProfile } from "./banks";
import { AMOUNT_TOKEN, findLeadingDate, findPeriod, parseAmount, resolveYear } from "./primitives";

/** Satu potongan teks dari PDF, dengan posisi horizontalnya. */
export interface TextCell {
  str: string;
  x: number;
}

export interface ExtractedLine {
  text: string;
  cells: TextCell[];
  page: number;
}

export interface RawRecord {
  date: string;
  description: string;
  amount: number;
  direction: Direction;
  balance?: number;
  /** Seberapa yakin arah dana (debit/kredit) ditentukan. 0–1. */
  directionConfidence: number;
  origin: string;
}

export interface EngineResult {
  records: RawRecord[];
  warnings: ParseWarning[];
  periodStart?: string;
  periodEnd?: string;
}

/** Apakah sebuah potongan teks masuk akal sebagai nominal uang? */
export function looksLikeAmount(str: string): boolean {
  const s = str.trim().replace(/^(?:Rp|IDR)\.?\s*/i, "");
  if (!s) return false;
  if (!/^-?\(?[\d.,]+\)?-?$/.test(s)) return false;
  const digits = s.replace(/\D/g, "");
  if (digits.length === 0) return false;
  const value = parseAmount(s);
  if (value === null) return false;

  const hasSeparator = /[.,]/.test(s);
  // Angka bulat panjang tanpa pemisah biasanya nomor referensi, bukan rupiah.
  if (!hasSeparator && digits.length > 9) return false;
  // Tahun polos ("2026") sering nyempil di kolom keterangan.
  if (!hasSeparator && digits.length === 4 && value >= 1990 && value <= 2100) return false;
  return Math.abs(value) <= 1e12;
}

interface ColumnMap {
  debitX?: number;
  creditX?: number;
  balanceX?: number;
  amountX?: number;
}

/**
 * Cari baris header kolom dan catat posisi x tiap kolom. Ini yang membuat
 * pemisahan debit/kredit andal pada statement Mandiri/BRI/BNI yang memakai dua
 * kolom terpisah tanpa penanda DB/CR.
 */
export function detectColumns(lines: ExtractedLine[], profile: BankProfile): ColumnMap {
  const map: ColumnMap = {};
  for (const line of lines.slice(0, 120)) {
    const { debit, credit, balance, amount } = profile.columns;
    const hasDebit = debit.test(line.text);
    const hasCredit = credit.test(line.text);
    const hasBalance = balance.test(line.text);
    // Butuh minimal dua penanda kolom supaya tidak salah ambil baris biasa.
    if ([hasDebit, hasCredit, hasBalance].filter(Boolean).length < 2) continue;

    for (const cell of line.cells) {
      const s = cell.str;
      if (map.debitX === undefined && debit.test(s)) map.debitX = cell.x;
      if (map.creditX === undefined && credit.test(s)) map.creditX = cell.x;
      if (map.balanceX === undefined && balance.test(s)) map.balanceX = cell.x;
      if (amount && map.amountX === undefined && amount.test(s)) map.amountX = cell.x;
    }
    if (map.debitX !== undefined || map.creditX !== undefined) break;
  }
  return map;
}

/** Ambil sel-sel numerik dari sebuah baris, beserta posisinya. */
function numericCells(line: ExtractedLine): { value: number; x: number; raw: string }[] {
  const fromCells = line.cells
    .filter((c) => looksLikeAmount(c.str))
    .map((c) => ({ value: parseAmount(c.str)!, x: c.x, raw: c.str.trim() }));
  if (fromCells.length > 0) return fromCells;

  // Fallback: seluruh baris datang sebagai satu potongan teks (atau dari CSV).
  const out: { value: number; x: number; raw: string }[] = [];
  const re = new RegExp(AMOUNT_TOKEN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(line.text)) !== null) {
    if (!looksLikeAmount(m[0])) continue;
    out.push({ value: parseAmount(m[0])!, x: m.index, raw: m[0] });
  }
  return out;
}

function stripCells(text: string, raws: string[]): string {
  let out = text;
  for (const raw of raws) {
    const idx = out.lastIndexOf(raw);
    if (idx >= 0) out = out.slice(0, idx) + " " + out.slice(idx + raw.length);
  }
  return out;
}

function cleanDescription(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s|·.-]+|[\s|·.-]+$/g, "")
    .trim();
}

/**
 * Mesin parser berbasis baris. Dipakai untuk PDF semua bank, dan sebagai
 * cadangan untuk CSV yang headernya tidak terbaca.
 */
export function parseLines(lines: ExtractedLine[], profile: BankProfile): EngineResult {
  const warnings: ParseWarning[] = [];
  const fullText = lines.map((l) => l.text).join("\n");
  const period = findPeriod(fullText);
  const columns = detectColumns(lines, profile);

  const records: RawRecord[] = [];
  let skippedNoAmount = 0;

  for (const line of lines) {
    const text = line.text;
    if (!text.trim()) continue;
    if (profile.skip.some((re) => re.test(text))) continue;

    const dateMatch = findLeadingDate(text);

    if (!dateMatch) {
      // Baris lanjutan: keterangan panjang yang dipecah ke baris berikutnya.
      const last = records[records.length - 1];
      const isContinuation =
        last !== undefined && numericCells(line).length === 0 && /[A-Za-z]{3}/.test(text);
      if (isContinuation) {
        last.description = cleanDescription(`${last.description} ${text}`);
      }
      continue;
    }

    const cells = numericCells(line);
    if (cells.length === 0) {
      skippedNoAmount++;
      continue;
    }

    // Kolom saldo hampir selalu paling kanan.
    let balance: number | undefined;
    let valueCells = cells;
    if (cells.length >= 2) {
      const rightmost = cells[cells.length - 1];
      const nearBalanceColumn =
        columns.balanceX === undefined || Math.abs(rightmost.x - columns.balanceX) < 90;
      if (nearBalanceColumn) {
        balance = rightmost.value;
        valueCells = cells.slice(0, -1);
      }
    }
    if (valueCells.length === 0) {
      // Hanya ada satu angka dan itu tertebak sebagai saldo — pakai sebagai nominal.
      valueCells = cells;
      balance = undefined;
    }

    const { amount, direction, directionConfidence } = resolveDirection(
      text,
      valueCells,
      columns,
      profile,
    );
    if (amount === null || amount === 0) {
      skippedNoAmount++;
      continue;
    }

    let description = stripCells(text, cells.map((c) => c.raw));
    description = description.slice(0, dateMatch.index) + description.slice(dateMatch.index + dateMatch.raw.length);
    if (profile.markers) {
      description = description.replace(profile.markers.debit, " ").replace(profile.markers.credit, " ");
    }
    description = cleanDescription(description);

    records.push({
      date: resolveYear(dateMatch.iso, period.start, period.end),
      description: description || "(tanpa keterangan)",
      amount: Math.abs(amount),
      direction,
      balance,
      directionConfidence,
      origin: `hal.${line.page}`,
    });
  }

  const corrected = reconcileWithBalance(records);
  if (corrected > 0) {
    warnings.push({
      level: "info",
      message: `${corrected} transaksi arah debit/kreditnya dikoreksi otomatis dari selisih saldo.`,
    });
  }
  if (skippedNoAmount > 0) {
    warnings.push({
      level: "info",
      message: `${skippedNoAmount} baris berawalan tanggal dilewati karena nominalnya tidak terbaca.`,
    });
  }
  if (records.length === 0) {
    warnings.push({
      level: "warn",
      message:
        "Tidak ada transaksi yang terbaca. Kalau ini PDF hasil scan, teksnya perlu OCR dulu; kalau bukan, coba ekspor ulang sebagai CSV.",
    });
  }

  const dates = records.map((r) => r.date).sort();
  return {
    records,
    warnings,
    periodStart: period.start ?? dates[0],
    periodEnd: period.end ?? dates[dates.length - 1],
  };
}

function resolveDirection(
  text: string,
  cells: { value: number; x: number }[],
  columns: ColumnMap,
  profile: BankProfile,
): { amount: number | null; direction: Direction; directionConfidence: number } {
  // 1. Penanda eksplisit di baris (BCA: "DB"/"CR"; BSI/Mandiri: "D"/"K").
  if (profile.markers) {
    if (profile.markers.credit.test(text)) {
      return { amount: pickAmount(cells), direction: "credit", directionConfidence: 0.95 };
    }
    if (profile.markers.debit.test(text)) {
      return { amount: pickAmount(cells), direction: "debit", directionConfidence: 0.95 };
    }
  }

  // 2. Tanda negatif / kurung akuntansi.
  const signed = cells.find((c) => c.value !== 0);
  if (signed && signed.value < 0) {
    return { amount: Math.abs(signed.value), direction: "debit", directionConfidence: 0.9 };
  }

  // 3. Dua kolom terpisah: tentukan dari posisi x sel yang nilainya bukan nol.
  if (columns.debitX !== undefined && columns.creditX !== undefined) {
    const nonZero = cells.filter((c) => c.value !== 0);
    if (nonZero.length === 1) {
      const cell = nonZero[0];
      const dDebit = Math.abs(cell.x - columns.debitX);
      const dCredit = Math.abs(cell.x - columns.creditX);
      if (Math.abs(dDebit - dCredit) > 20) {
        return {
          amount: cell.value,
          direction: dDebit < dCredit ? "debit" : "credit",
          directionConfidence: 0.85,
        };
      }
    }
    // Dua sel: yang pertama debit, kedua kredit — ambil yang bukan nol.
    if (cells.length >= 2) {
      const [debitCell, creditCell] = cells;
      if (debitCell.value !== 0 && creditCell.value === 0) {
        return { amount: debitCell.value, direction: "debit", directionConfidence: 0.8 };
      }
      if (creditCell.value !== 0 && debitCell.value === 0) {
        return { amount: creditCell.value, direction: "credit", directionConfidence: 0.8 };
      }
    }
  }

  // 4. Menyerah: anggap pengeluaran (mayoritas baris mutasi), tandai ragu.
  // `reconcileWithBalance` biasanya akan memperbaikinya dari selisih saldo.
  return { amount: pickAmount(cells), direction: "debit", directionConfidence: 0.3 };
}

function pickAmount(cells: { value: number }[]): number | null {
  const nonZero = cells.find((c) => c.value !== 0);
  return nonZero ? Math.abs(nonZero.value) : null;
}

/**
 * Koreksi arah dana dari selisih saldo berjalan. Ini jaring pengaman paling
 * kuat: kalau kolom saldo terbaca, arah debit/kredit jadi pasti tanpa perlu
 * tahu layout kolom bank mana pun.
 */
export function reconcileWithBalance(records: RawRecord[]): number {
  let corrected = 0;
  for (let i = 1; i < records.length; i++) {
    const prev = records[i - 1];
    const curr = records[i];
    if (prev.balance === undefined || curr.balance === undefined) continue;

    const delta = curr.balance - prev.balance;
    // Selisih saldo harus cocok dengan nominal (toleransi pembulatan 1 rupiah).
    if (Math.abs(Math.abs(delta) - curr.amount) > 1) continue;

    const expected: Direction = delta >= 0 ? "credit" : "debit";
    if (curr.direction !== expected) {
      curr.direction = expected;
      corrected++;
    }
    curr.directionConfidence = 1;
  }
  return corrected;
}

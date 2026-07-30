import type { Transaction } from "@/lib/types";
import { getCategory } from "@/lib/qris/categories";
import { GENERIC_MERCHANT_LABELS } from "@/lib/qris/rules";

export interface CategoryTotal {
  categoryId: string;
  label: string;
  emoji: string;
  total: number;
  count: number;
  share: number;
}

export interface MerchantTotal {
  merchant: string;
  total: number;
  count: number;
  categoryId: string;
  avg: number;
}

export interface MonthTotal {
  month: string;
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface DayTotal {
  date: string;
  expense: number;
  income: number;
  balance?: number;
}

export interface WeekdayTotal {
  weekday: number;
  label: string;
  total: number;
  count: number;
  avg: number;
}

export interface Recurring {
  merchant: string;
  categoryId: string;
  occurrences: number;
  avgAmount: number;
  /** Rata-rata jarak hari antar transaksi. */
  intervalDays: number;
  lastDate: string;
  monthlyEstimate: number;
  /**
   * Hanya dua kejadian yang terlihat, jadi ini dugaan — bukan pola yang sudah
   * terbukti. Muncul kalau datanya baru mencakup dua bulan.
   */
  tentative?: boolean;
}

export interface Anomaly {
  tx: Transaction;
  categoryLabel: string;
  /** Berapa kali lipat dari rata-rata kategorinya. */
  ratio: number;
}

export interface Metrics {
  income: number;
  expense: number;
  net: number;
  count: number;
  periodStart: string;
  periodEnd: string;
  days: number;
  avgDailyExpense: number;
  avgTransaction: number;
  savingsRate: number;
  qrisCount: number;
  qrisTotal: number;
  identifiedShare: number;
  aiIdentifiedCount: number;
  /** Transaksi yang keterangannya memang tidak memuat nama merchant. */
  noMerchantInfoCount: number;
  noMerchantInfoTotal: number;
  byCategory: CategoryTotal[];
  byMerchant: MerchantTotal[];
  byMonth: MonthTotal[];
  byDay: DayTotal[];
  byWeekday: WeekdayTotal[];
  largest: Transaction[];
  recurring: Recurring[];
  anomalies: Anomaly[];
  endingBalance?: number;
}

const WEEKDAY_LABELS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_LABELS[Number(m) - 1] ?? m} ${y.slice(2)}`;
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Kategori yang bukan pengeluaran konsumtif. Dikeluarkan dari total
 * "pengeluaran" supaya pindah-buku dan investasi tidak menggelembungkan angka.
 */
const NON_SPENDING = new Set(["transfer_keluar", "investasi", "tarik_tunai", "topup_ewallet"]);

export function computeMetrics(transactions: Transaction[]): Metrics {
  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const debits = sorted.filter((t) => t.direction === "debit");
  const credits = sorted.filter((t) => t.direction === "credit");

  const income = credits.reduce((s, t) => s + t.amount, 0);
  const expense = debits.reduce((s, t) => s + t.amount, 0);

  const periodStart = sorted[0]?.date ?? "";
  const periodEnd = sorted[sorted.length - 1]?.date ?? "";
  const days = periodStart && periodEnd ? daysBetween(periodStart, periodEnd) : 1;

  // ── Per kategori (hanya pengeluaran konsumtif) ─────────────────────────────
  const spendingDebits = debits.filter((t) => !NON_SPENDING.has(t.category));
  const spendingTotal = spendingDebits.reduce((s, t) => s + t.amount, 0);
  const catMap = new Map<string, { total: number; count: number }>();
  for (const t of debits) {
    const entry = catMap.get(t.category) ?? { total: 0, count: 0 };
    entry.total += t.amount;
    entry.count += 1;
    catMap.set(t.category, entry);
  }
  const byCategory: CategoryTotal[] = [...catMap.entries()]
    .map(([categoryId, v]) => {
      const cat = getCategory(categoryId);
      return {
        categoryId,
        label: cat.label,
        emoji: cat.emoji,
        total: v.total,
        count: v.count,
        share: expense > 0 ? v.total / expense : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  // ── Per merchant ──────────────────────────────────────────────────────────
  const merchantMap = new Map<string, { total: number; count: number; categoryId: string }>();
  for (const t of debits) {
    const name = t.merchant?.trim() || "Tidak Teridentifikasi";
    const entry = merchantMap.get(name) ?? { total: 0, count: 0, categoryId: t.category };
    entry.total += t.amount;
    entry.count += 1;
    merchantMap.set(name, entry);
  }
  const byMerchant: MerchantTotal[] = [...merchantMap.entries()]
    .map(([merchant, v]) => ({
      merchant,
      total: v.total,
      count: v.count,
      categoryId: v.categoryId,
      avg: v.total / v.count,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Per bulan ─────────────────────────────────────────────────────────────
  const monthMap = new Map<string, { income: number; expense: number }>();
  for (const t of sorted) {
    const key = t.date.slice(0, 7);
    const entry = monthMap.get(key) ?? { income: 0, expense: 0 };
    if (t.direction === "credit") entry.income += t.amount;
    else entry.expense += t.amount;
    monthMap.set(key, entry);
  }
  const byMonth: MonthTotal[] = [...monthMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([month, v]) => ({
      month,
      label: monthLabel(month),
      income: v.income,
      expense: v.expense,
      net: v.income - v.expense,
    }));

  // ── Per hari (untuk garis saldo) ──────────────────────────────────────────
  const dayMap = new Map<string, DayTotal>();
  for (const t of sorted) {
    const entry = dayMap.get(t.date) ?? { date: t.date, expense: 0, income: 0 };
    if (t.direction === "credit") entry.income += t.amount;
    else entry.expense += t.amount;
    if (t.balance !== undefined) entry.balance = t.balance;
    dayMap.set(t.date, entry);
  }
  const byDay = [...dayMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  // ── Per hari dalam seminggu ───────────────────────────────────────────────
  const weekdayMap = new Map<number, { total: number; count: number }>();
  for (const t of spendingDebits) {
    const wd = new Date(`${t.date}T00:00:00Z`).getUTCDay();
    const entry = weekdayMap.get(wd) ?? { total: 0, count: 0 };
    entry.total += t.amount;
    entry.count += 1;
    weekdayMap.set(wd, entry);
  }
  const byWeekday: WeekdayTotal[] = Array.from({ length: 7 }, (_, wd) => {
    const v = weekdayMap.get(wd) ?? { total: 0, count: 0 };
    return {
      weekday: wd,
      label: WEEKDAY_LABELS[wd],
      total: v.total,
      count: v.count,
      avg: v.count > 0 ? v.total / v.count : 0,
    };
    // Senin lebih intuitif sebagai awal minggu untuk pembaca Indonesia.
  }).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7));

  // "Teridentifikasi" berarti merchant-nya benar-benar diketahui. Transaksi yang
  // statement-nya tidak mencantumkan nama merchant TIDAK dihitung teridentifikasi,
  // walau klasifikasinya sudah final — supaya angkanya jujur.
  const identified = sorted.filter(
    (t) => t.source !== "unknown" && t.confidence >= 0.5 && !t.noMerchantInfo,
  ).length;
  const noMerchant = sorted.filter((t) => t.noMerchantInfo);
  const qrisTx = sorted.filter((t) => t.kind === "qris");

  return {
    income,
    expense,
    net: income - expense,
    count: sorted.length,
    periodStart,
    periodEnd,
    days,
    avgDailyExpense: spendingTotal / days,
    avgTransaction: debits.length > 0 ? expense / debits.length : 0,
    savingsRate: income > 0 ? (income - expense) / income : 0,
    qrisCount: qrisTx.length,
    qrisTotal: qrisTx.reduce((s, t) => s + t.amount, 0),
    identifiedShare: sorted.length > 0 ? identified / sorted.length : 0,
    aiIdentifiedCount: sorted.filter((t) => t.source === "ai").length,
    noMerchantInfoCount: noMerchant.length,
    noMerchantInfoTotal: noMerchant.reduce((s, t) => s + t.amount, 0),
    byCategory,
    byMerchant,
    byMonth,
    byDay,
    byWeekday,
    largest: [...debits].sort((a, b) => b.amount - a.amount).slice(0, 10),
    recurring: detectRecurring(debits),
    anomalies: detectAnomalies(spendingDebits),
    endingBalance: [...sorted].reverse().find((t) => t.balance !== undefined)?.balance,
  };
}

/** Rentang jarak hari yang dianggap "sebulan sekali". */
const MONTHLY_MIN = 25;
const MONTHLY_MAX = 35;

/**
 * Deteksi langganan / tagihan berulang: merchant yang sama, dengan nominal yang
 * relatif stabil dan jarak antar-transaksi yang teratur.
 *
 * Ada dua tingkat bukti:
 *
 * - **≥3 kejadian** — pola sudah terbukti; jarak antar transaksi harus teratur.
 * - **2 kejadian** — hanya diterima kalau jaraknya persis sebulanan (25–35 hari)
 *   dan nominalnya nyaris sama, lalu ditandai `tentative`. Tanpa keringanan ini,
 *   langganan bulanan mustahil terdeteksi dari statement dua bulan: sebulan
 *   sekali selama dua bulan hanya menghasilkan dua kejadian.
 */
export function detectRecurring(debits: Transaction[]): Recurring[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of debits) {
    const name = t.merchant?.trim();
    if (!name || name === "Tidak Teridentifikasi" || name === "QRIS tanpa nama merchant") continue;
    // Label keranjang ("Tarik Tunai", "Pembayaran Tagihan") mengumpulkan
    // transaksi yang tidak berhubungan, jadi kemiripan nominalnya kebetulan.
    if (GENERIC_MERCHANT_LABELS.has(name)) continue;
    const bucket = groups.get(name);
    if (bucket) bucket.push(t);
    else groups.set(name, [t]);
  }

  const out: Recurring[] = [];
  for (const [merchant, txs] of groups) {
    if (txs.length < 2) continue;
    const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
    const amounts = sorted.map((t) => t.amount);
    const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (avg <= 0) continue;

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date) - 1);
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

    let tentative = false;
    if (sorted.length === 2) {
      // Bukti tipis, jadi syaratnya lebih ketat: harus benar-benar sebulanan dan
      // nominalnya nyaris sama (toleransi 10%, supaya biaya bulanan yang naik
      // sedikit tetap tertangkap).
      if (avgGap < MONTHLY_MIN || avgGap > MONTHLY_MAX) continue;
      // Toleransi relatif 10%, ATAU selisih absolut ≤ Rp 1.000. Yang kedua perlu
      // karena ambang relatif terlalu keras untuk nominal kecil: biaya bulanan
      // ATM yang naik Rp 3.000 → Rp 3.500 tetap langganan yang sama.
      const diff = Math.abs(amounts[0] - amounts[1]);
      if (diff / avg > 0.1 && diff > 1000) continue;
      tentative = true;
    } else {
      // Nominal harus stabil: simpangan relatif di bawah 20%.
      const variance = amounts.reduce((s, a) => s + (a - avg) ** 2, 0) / amounts.length;
      if (Math.sqrt(variance) / avg > 0.2) continue;

      // Jarak antar transaksi harus cukup teratur.
      if (avgGap < 5 || avgGap > 45) continue;
      const gapVariance = gaps.reduce((s, g) => s + (g - avgGap) ** 2, 0) / gaps.length;
      if (Math.sqrt(gapVariance) > avgGap * 0.5) continue;
    }

    out.push({
      merchant,
      categoryId: sorted[sorted.length - 1].category,
      occurrences: sorted.length,
      avgAmount: avg,
      intervalDays: Math.round(avgGap),
      lastDate: sorted[sorted.length - 1].date,
      monthlyEstimate: avg * (30 / Math.max(1, avgGap)),
      tentative,
    });
  }
  return out.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate);
}

/**
 * Transaksi yang jauh di atas kebiasaan dalam kategorinya sendiri.
 * Ambang: 2.5 simpangan baku, dan minimal 2x rata-rata kategori.
 */
export function detectAnomalies(debits: Transaction[]): Anomaly[] {
  const byCat = new Map<string, Transaction[]>();
  for (const t of debits) {
    const bucket = byCat.get(t.category);
    if (bucket) bucket.push(t);
    else byCat.set(t.category, [t]);
  }

  const out: Anomaly[] = [];
  for (const [categoryId, txs] of byCat) {
    if (txs.length < 5) continue;
    const amounts = txs.map((t) => t.amount);
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const sd = Math.sqrt(amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length);
    if (sd === 0) continue;
    const threshold = mean + 2.5 * sd;
    for (const t of txs) {
      if (t.amount < threshold || t.amount < mean * 2) continue;
      out.push({ tx: t, categoryLabel: getCategory(categoryId).label, ratio: t.amount / mean });
    }
  }
  return out.sort((a, b) => b.tx.amount - a.tx.amount).slice(0, 8);
}

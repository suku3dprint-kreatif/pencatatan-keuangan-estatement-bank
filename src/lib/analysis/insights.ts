import type { Metrics } from "./metrics";
import { persen, rupiah } from "@/lib/format";
import { tanggal } from "@/lib/format";

export type InsightTone = "good" | "warning" | "critical" | "neutral";

export interface Insight {
  tone: InsightTone;
  title: string;
  body: string;
}

export interface InsightContext {
  /** Jumlah transaksi yang statement-nya tidak memuat nama merchant. */
  noMerchantInfo: number;
  aiAvailable: boolean;
}

/**
 * Terjemahkan angka jadi temuan berbahasa manusia. Sengaja konservatif:
 * satu temuan hanya muncul kalau datanya cukup untuk mendukungnya.
 */
export function buildInsights(m: Metrics, ctx?: InsightContext): Insight[] {
  const out: Insight[] = [];
  if (m.count === 0) return out;

  // ── Arus kas ───────────────────────────────────────────────────────────────
  if (m.net < 0) {
    out.push({
      tone: "critical",
      title: `Arus kas minus ${rupiah(Math.abs(m.net))}`,
      body: `Selama periode ini pengeluaranmu (${rupiah(m.expense)}) lebih besar daripada pemasukan (${rupiah(m.income)}). Selisihnya diambil dari saldo yang sudah ada.`,
    });
  } else if (m.income > 0) {
    const tone: InsightTone = m.savingsRate >= 0.2 ? "good" : m.savingsRate >= 0.1 ? "neutral" : "warning";
    out.push({
      tone,
      title: `Tingkat menabung ${persen(m.savingsRate)}`,
      body:
        m.savingsRate >= 0.2
          ? `Sisa ${rupiah(m.net)} dari pemasukan ${rupiah(m.income)}. Ini di atas patokan umum 20% — pertahankan.`
          : `Sisa ${rupiah(m.net)} dari pemasukan ${rupiah(m.income)}. Patokan yang sering dipakai adalah menyisihkan minimal 20%; sekarang masih di bawah itu.`,
    });
  }

  // ── Kategori dominan ──────────────────────────────────────────────────────
  const top = m.byCategory[0];
  if (top && top.share >= 0.15) {
    out.push({
      tone: top.share >= 0.4 ? "warning" : "neutral",
      title: `${top.emoji} ${top.label} menyerap ${persen(top.share)} pengeluaran`,
      body: `Total ${rupiah(top.total)} dari ${top.count} transaksi. ${
        top.share >= 0.4
          ? "Porsi sebesar ini biasanya jadi tempat penghematan paling terasa."
          : `Rata-rata ${rupiah(top.total / top.count)} per transaksi.`
      }`,
    });
  }

  // ── Frekuensi kecil-kecil yang menumpuk ───────────────────────────────────
  const frequent = m.byMerchant
    .filter((x) => x.count >= 8 && x.merchant !== "Tidak Teridentifikasi")
    .sort((a, b) => b.count - a.count)[0];
  if (frequent) {
    out.push({
      tone: "neutral",
      title: `${frequent.merchant}: ${frequent.count}x transaksi`,
      body: `Rata-rata ${rupiah(frequent.avg)} sekali belanja, totalnya ${rupiah(frequent.total)}. Transaksi kecil yang sering terjadi sering tak terasa padahal jumlahnya besar.`,
    });
  }

  // ── Langganan berulang ────────────────────────────────────────────────────
  if (m.recurring.length > 0) {
    const monthly = m.recurring.reduce((s, r) => s + r.monthlyEstimate, 0);
    // Yang baru terlihat dua kali masih dugaan. Kalau tidak disebut, angka beban
    // tetap di atas terkesan lebih pasti daripada buktinya.
    const tentative = m.recurring.filter((r) => r.tentative).length;
    const catatan =
      tentative === 0
        ? ""
        : ` ${tentative} di antaranya baru terlihat dua kali, jadi masih dugaan.`;
    out.push({
      tone: monthly > m.expense * 0.15 ? "warning" : "neutral",
      title: `${m.recurring.length} pembayaran berulang terdeteksi`,
      body: `Perkiraan beban tetap sekitar ${rupiah(monthly)} per bulan, dipimpin ${m.recurring[0].merchant} (${rupiah(m.recurring[0].avgAmount)} tiap ~${m.recurring[0].intervalDays} hari).${catatan} Cek apakah semuanya masih kamu pakai.`,
    });
  }

  // ── Laju pengeluaran ──────────────────────────────────────────────────────
  if (m.days >= 7) {
    out.push({
      tone: "neutral",
      title: `Laju pengeluaran ${rupiah(m.avgDailyExpense)} per hari`,
      body: `Kalau ritme ini bertahan, sebulan penuh kira-kira ${rupiah(m.avgDailyExpense * 30)}. Angka ini sudah mengecualikan transfer, tarik tunai, top up, dan investasi.`,
    });
  }

  // ── Hari paling boros ─────────────────────────────────────────────────────
  const busiest = [...m.byWeekday].sort((a, b) => b.total - a.total)[0];
  if (busiest && busiest.total > 0 && m.days >= 14) {
    out.push({
      tone: "neutral",
      title: `${busiest.label} jadi hari paling boros`,
      body: `Total ${rupiah(busiest.total)} dari ${busiest.count} transaksi, rata-rata ${rupiah(busiest.avg)} sekali jalan.`,
    });
  }

  // ── Anomali ───────────────────────────────────────────────────────────────
  if (m.anomalies.length > 0) {
    const a = m.anomalies[0];
    out.push({
      tone: "warning",
      title: `Transaksi tak biasa: ${rupiah(a.tx.amount)}`,
      body: `${a.tx.merchant ?? a.tx.description.slice(0, 40)} pada ${tanggal(a.tx.date)} — sekitar ${a.ratio.toFixed(1).replace(".", ",")}x rata-rata kategori ${a.categoryLabel}.`,
    });
  }

  // ── QRIS ──────────────────────────────────────────────────────────────────
  if (m.qrisCount > 0) {
    out.push({
      tone: "neutral",
      title: `${m.qrisCount} transaksi QRIS senilai ${rupiah(m.qrisTotal)}`,
      body: `${persen(m.qrisCount / m.count)} dari seluruh transaksimu lewat QRIS${
        m.aiIdentifiedCount > 0 ? `, dan ${m.aiIdentifiedCount} di antaranya baru bisa dikenali setelah dianalisa AI.` : "."
      }`,
    });
  }

  // ── Batasan data dari banknya sendiri ─────────────────────────────────────
  // Ini temuan yang penting justru karena bukan soal tools-nya: kalau statement
  // tidak mencantumkan nama merchant, tidak ada cara menebaknya dari data itu.
  const noInfo = ctx?.noMerchantInfo ?? m.noMerchantInfoCount;
  if (noInfo > 0 && m.count > 0) {
    out.push({
      tone: noInfo / m.count > 0.4 ? "warning" : "neutral",
      title: `${noInfo} transaksi tanpa nama merchant di statement`,
      body: `Senilai ${rupiah(m.noMerchantInfoTotal)} (${persen(noInfo / m.count)} dari jumlah transaksi). Keterangannya hanya berisi kode transaksi dan merchant PAN — ini batasan ekspor banknya, bukan kegagalan analisa. Untuk melacaknya, cocokkan tanggal dan nominalnya dengan riwayat di aplikasi mobile banking.`,
    });
  }

  // ── Kualitas identifikasi ─────────────────────────────────────────────────
  // Hanya ditampilkan kalau memang masih ada yang bisa diperbaiki: transaksi
  // tanpa nama merchant tidak akan membaik walau AI dinyalakan.
  const fixable = m.count - noInfo;
  const identifiedOfFixable = fixable > 0 ? (m.identifiedShare * m.count) / fixable : 1;
  if (fixable > 0 && identifiedOfFixable < 0.75) {
    out.push({
      tone: "warning",
      title: `${persen(1 - identifiedOfFixable)} dari transaksi yang bisa dikenali masih belum jelas`,
      body:
        ctx && !ctx.aiAvailable
          ? "AI analyzer belum aktif. Isi ANTHROPIC_API_KEY di .env.local, atau perbaiki kategorinya manual di tabel di bawah."
          : "Perbaiki kategorinya manual di tabel di bawah — koreksinya otomatis berlaku untuk semua transaksi dengan pola keterangan yang sama.",
    });
  }

  return out;
}

"use client";

import { useMemo } from "react";
import type { Transaction } from "@/lib/types";
import type { MergedStatement } from "@/lib/analysis/merge";
import { computeMetrics } from "@/lib/analysis/metrics";
import { buildInsights } from "@/lib/analysis/insights";
import { angka, periode, persen, rupiah } from "@/lib/format";
import { Card, CardHeader, Badge } from "@/components/ui";
import { StatTiles } from "@/components/StatTiles";
import { CashFlowChart } from "@/components/charts/CashFlowChart";
import { CategoryChart } from "@/components/charts/CategoryChart";
import { MerchantChart } from "@/components/charts/MerchantChart";
import { BalanceChart } from "@/components/charts/BalanceChart";
import { WeekdayChart } from "@/components/charts/WeekdayChart";
import { AnomalyPanel, InsightList, RecurringPanel } from "@/components/Panels";
import { TransactionTable } from "@/components/TransactionTable";

export function Dashboard({
  merged,
  transactions,
  onCategoryChange,
  onReset,
  aiPanel,
  aiAvailable,
}: {
  merged: MergedStatement;
  transactions: Transaction[];
  onCategoryChange: (id: string, categoryId: string) => void;
  onReset: () => void;
  aiPanel: React.ReactNode;
  aiAvailable: boolean;
}) {
  const metrics = useMemo(() => computeMetrics(transactions), [transactions]);
  const insights = useMemo(
    () => buildInsights(metrics, { noMerchantInfo: merged.noMerchantInfo, aiAvailable }),
    [metrics, merged.noMerchantInfo, aiAvailable],
  );

  const multiFile = merged.files.length > 1;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base font-semibold text-ink">{merged.bankLabel}</h1>
              {multiFile ? (
                <Badge>
                  {angka(merged.files.length)} file digabung
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              {angka(merged.transactions.length)} transaksi terbaca
              {merged.duplicatesRemoved > 0
                ? ` · ${angka(merged.duplicatesRemoved)} duplikat dibuang`
                : ""}
            </p>
            <p className="mt-0.5 text-xs text-ink-2">
              {periode(metrics.periodStart || merged.periodStart, metrics.periodEnd || merged.periodEnd)}
              {metrics.endingBalance !== undefined
                ? ` · saldo akhir ${rupiah(metrics.endingBalance)}`
                : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-[color:var(--gridline)] no-print"
          >
            Ganti file
          </button>
        </div>

        {/* Rincian per file — penting supaya jelas periode mana dari file mana. */}
        <ul className="mt-3 grid gap-1.5 border-t border-hairline pt-3 sm:grid-cols-2">
          {merged.files.map((f) => (
            <li key={f.fileName} className="flex items-baseline gap-2 text-[11px]">
              <span
                aria-hidden
                className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ background: "var(--series-1)" }}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink-2" title={f.fileName}>
                  {f.fileName}
                </span>
                <span className="text-ink-muted">
                  {f.fileType.toUpperCase()}
                  {f.pages ? ` · ${f.pages} hal.` : ""} · {angka(f.rows)} transaksi
                  {f.periodStart ? ` · ${periode(f.periodStart, f.periodEnd)}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>

        {merged.warnings.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-hairline pt-3">
            {merged.warnings.map((w, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] text-ink-muted">
                <span
                  aria-hidden
                  style={{ color: w.level === "warn" ? "var(--status-warning)" : "var(--text-muted)" }}
                >
                  {w.level === "warn" ? "!" : "•"}
                </span>
                <span>{w.message}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      {aiPanel}

      <StatTiles metrics={metrics} />

      {/* ── Arus kas + kategori ────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Arus kas per bulan"
            subtitle="Uang masuk dibanding uang keluar, satu sumbu nominal"
          />
          <CashFlowChart data={metrics.byMonth} />
        </Card>

        <Card>
          <CardHeader
            title="Pengeluaran per kategori"
            subtitle={`${angka(metrics.byCategory.length)} kategori aktif dari total ${rupiah(metrics.expense)}`}
          />
          <CategoryChart data={metrics.byCategory} />
        </Card>
      </div>

      {/* ── Merchant + saldo ───────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="10 merchant terbesar" subtitle="Berdasarkan total pengeluaran" />
          <MerchantChart data={metrics.byMerchant} />
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Saldo harian" subtitle="Dari kolom saldo di statement" />
            <BalanceChart data={metrics.byDay} />
          </Card>
          <Card>
            <CardHeader
              title="Pola per hari"
              subtitle="Total pengeluaran konsumtif, dikelompokkan per hari dalam seminggu"
            />
            <WeekdayChart data={metrics.byWeekday} />
          </Card>
        </div>
      </div>

      {/* ── Analisa detail ─────────────────────────────────────────────────── */}
      {/* items-start: tanpa ini ketiga kartu diregangkan setinggi "Temuan" yang
          paling panjang, dan kartu berulang/anomali menyisakan ruang kosong
          ratusan piksel. */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Temuan" subtitle="Kesimpulan yang bisa langsung ditindaklanjuti" />
          <InsightList insights={insights} />
        </Card>

        <Card>
          <CardHeader
            title="Pembayaran berulang"
            subtitle="Nominal stabil dengan jarak waktu teratur"
          />
          <RecurringPanel items={metrics.recurring} />
        </Card>

        <Card>
          <CardHeader
            title="Transaksi tak biasa"
            subtitle="Jauh di atas rata-rata kategorinya sendiri"
          />
          <AnomalyPanel items={metrics.anomalies} />
        </Card>
      </div>

      {/* ── Tabel ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Semua transaksi"
          subtitle={`${persen(metrics.identifiedShare)} sudah teridentifikasi — kategori bisa dikoreksi manual dan tersimpan di browser`}
        />
        <TransactionTable transactions={transactions} onCategoryChange={onCategoryChange} />
      </Card>
    </div>
  );
}

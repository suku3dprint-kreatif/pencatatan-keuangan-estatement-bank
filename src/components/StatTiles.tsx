import type { Metrics } from "@/lib/analysis/metrics";
import { angka, persen, rupiah } from "@/lib/format";

interface Tile {
  label: string;
  value: string;
  sub?: string;
  /** Warna aksen hanya untuk penanda, bukan untuk teks nilainya. */
  accent?: string;
  marker?: string;
}

/**
 * Angka headline. Satu angka per kartu — bukan chart, karena tidak ada
 * perbandingan yang perlu dilihat bentuknya.
 */
export function StatTiles({ metrics }: { metrics: Metrics }) {
  const tiles: Tile[] = [
    {
      label: "Pemasukan",
      value: rupiah(metrics.income),
      accent: "var(--flow-in)",
      marker: "↓",
    },
    {
      label: "Pengeluaran",
      value: rupiah(metrics.expense),
      sub: `${angka(metrics.count)} transaksi`,
      accent: "var(--flow-out)",
      marker: "↑",
    },
    {
      label: "Selisih",
      value: rupiah(metrics.net),
      sub: metrics.income > 0 ? `tingkat menabung ${persen(metrics.savingsRate)}` : undefined,
      accent: metrics.net >= 0 ? "var(--status-good)" : "var(--status-critical)",
      marker: metrics.net >= 0 ? "✓" : "!",
    },
    {
      label: "Rata-rata per hari",
      value: rupiah(metrics.avgDailyExpense),
      sub: `dari ${angka(metrics.days)} hari`,
    },
    {
      label: "Transaksi QRIS",
      value: angka(metrics.qrisCount),
      sub: rupiah(metrics.qrisTotal),
    },
    {
      label: "Teridentifikasi",
      value: persen(metrics.identifiedShare),
      sub:
        metrics.aiIdentifiedCount > 0
          ? `${angka(metrics.aiIdentifiedCount)} dari AI`
          : "mesin rule-based",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-xl border border-hairline bg-surface px-4 py-3.5"
        >
          <div className="flex items-center gap-1.5">
            {tile.accent ? (
              <span
                aria-hidden
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: tile.accent }}
              />
            ) : null}
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
              {tile.label}
            </p>
          </div>
          <p className="tabular mt-1.5 text-lg font-semibold text-ink">
            {tile.marker ? (
              <span aria-hidden className="mr-1 text-sm text-ink-muted">
                {tile.marker}
              </span>
            ) : null}
            {tile.value}
          </p>
          {tile.sub ? <p className="mt-0.5 truncate text-[11px] text-ink-muted">{tile.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

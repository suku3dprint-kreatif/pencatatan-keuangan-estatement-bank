import type { Insight } from "@/lib/analysis/insights";
import type { Anomaly, Recurring } from "@/lib/analysis/metrics";
import { getCategory } from "@/lib/qris/categories";
import { angka, rupiah, tanggal } from "@/lib/format";
import { Empty } from "@/components/ui";

const TONE_STYLE: Record<Insight["tone"], { border: string; icon: string; label: string }> = {
  good: { border: "var(--status-good)", icon: "✓", label: "Bagus" },
  neutral: { border: "var(--axis)", icon: "•", label: "Info" },
  warning: { border: "var(--status-warning)", icon: "!", label: "Perhatian" },
  critical: { border: "var(--status-critical)", icon: "✕", label: "Penting" },
};

/** Warna status selalu berpasangan dengan ikon + label, tidak pernah warna saja. */
export function InsightList({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return <Empty>Belum cukup data untuk menarik kesimpulan.</Empty>;

  return (
    <ul className="space-y-2.5">
      {insights.map((insight, i) => {
        const tone = TONE_STYLE[insight.tone];
        return (
          <li
            key={`${insight.title}-${i}`}
            className="rounded-lg border border-hairline bg-[color:var(--page-plane)] p-3"
            style={{ borderLeftWidth: 3, borderLeftColor: tone.border }}
          >
            <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <span
                aria-hidden
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] text-white"
                style={{ background: tone.border }}
              >
                {tone.icon}
              </span>
              <span className="sr-only">{tone.label}: </span>
              {insight.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-2">{insight.body}</p>
          </li>
        );
      })}
    </ul>
  );
}

export function RecurringPanel({ items }: { items: Recurring[] }) {
  if (items.length === 0) {
    return <Empty>Tidak ada pembayaran berulang yang terdeteksi.</Empty>;
  }
  const total = items.reduce((s, r) => s + r.monthlyEstimate, 0);
  const anyTentative = items.some((r) => r.tentative);

  return (
    <div>
      <p className="mb-3 text-xs text-ink-2">
        Perkiraan beban tetap{" "}
        <strong className="tabular text-ink">{rupiah(total)}</strong> per bulan.
      </p>
      <ul className="divide-y divide-[color:var(--hairline)]">
        {items.slice(0, 8).map((r) => (
          <li key={r.merchant} className="flex items-baseline justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink">
                <span aria-hidden>{getCategory(r.categoryId).emoji}</span>
                <span className="truncate">{r.merchant}</span>
                {r.tentative ? (
                  <span
                    className="shrink-0 rounded-full border px-1.5 text-[10px] font-normal text-ink-2"
                    style={{ borderColor: "var(--status-warning)" }}
                    title="Baru terlihat dua kali, jadi ini masih dugaan"
                  >
                    dugaan
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-ink-muted">
                {angka(r.occurrences)}x · tiap ~{r.intervalDays} hari · terakhir {tanggal(r.lastDate)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="tabular text-xs font-medium text-ink">{rupiah(r.avgAmount)}</p>
              <p className="tabular text-[11px] text-ink-muted">≈{rupiah(r.monthlyEstimate)}/bln</p>
            </div>
          </li>
        ))}
      </ul>
      {anyTentative ? (
        <p className="mt-3 border-t border-hairline pt-2 text-[11px] leading-relaxed text-ink-muted">
          Yang bertanda <em>dugaan</em> baru terlihat dua kali dengan jarak sebulanan — upload
          statement bulan berikutnya untuk memastikan.
        </p>
      ) : null}
    </div>
  );
}

export function AnomalyPanel({ items }: { items: Anomaly[] }) {
  if (items.length === 0) {
    return <Empty>Tidak ada transaksi yang menyimpang jauh dari kebiasaan.</Empty>;
  }

  return (
    <ul className="divide-y divide-[color:var(--hairline)]">
      {items.map((a) => (
        <li key={a.tx.id} className="flex items-baseline justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-ink">
              {a.tx.merchant ?? a.tx.description.slice(0, 40)}
            </p>
            <p className="text-[11px] text-ink-muted">
              {tanggal(a.tx.date)} · {a.categoryLabel} ·{" "}
              <span className="tabular">{a.ratio.toFixed(1).replace(".", ",")}x</span> rata-rata
            </p>
          </div>
          <p className="tabular shrink-0 text-xs font-medium text-ink">{rupiah(a.tx.amount)}</p>
        </li>
      ))}
    </ul>
  );
}

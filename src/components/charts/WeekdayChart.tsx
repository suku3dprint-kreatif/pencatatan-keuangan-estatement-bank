"use client";

import type { WeekdayTotal } from "@/lib/analysis/metrics";
import { angka, rupiah } from "@/lib/format";
import { Empty } from "@/components/ui";

/**
 * Pola pengeluaran per hari dalam seminggu. Satu ukuran (total), jadi ini ramp
 * sekuensial satu hue — bukan warna kategorikal per hari.
 */
export function WeekdayChart({ data }: { data: WeekdayTotal[] }) {
  const max = Math.max(...data.map((d) => d.total), 0);
  if (max === 0) return <Empty>Belum ada pengeluaran untuk dipetakan.</Empty>;

  return (
    <ul className="flex h-44 items-end gap-2">
      {data.map((day) => {
        const ratio = day.total / max;
        return (
          <li key={day.weekday} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="tabular text-[10px] text-ink-muted">
              {day.total > 0 ? rupiah(day.total).replace("Rp", "") : "—"}
            </span>
            <div
              className="w-full rounded-t-[4px]"
              style={{
                height: `${Math.max(2, ratio * 100)}%`,
                // Ramp satu hue: makin gelap makin besar.
                background: ratio > 0.66 ? "var(--sequential-600)" : ratio > 0.33 ? "var(--sequential-450)" : "var(--sequential-200)",
              }}
              role="img"
              aria-label={`${day.label}: ${rupiah(day.total)} dari ${angka(day.count)} transaksi`}
              title={`${day.label} · ${angka(day.count)} transaksi · rata-rata ${rupiah(day.avg)}`}
            />
            <span className="text-[11px] text-ink-2">{day.label.slice(0, 3)}</span>
          </li>
        );
      })}
    </ul>
  );
}

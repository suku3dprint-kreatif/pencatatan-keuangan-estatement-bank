"use client";

import type { MerchantTotal } from "@/lib/analysis/metrics";
import { angka, rupiah } from "@/lib/format";
import { Empty } from "@/components/ui";

/**
 * Top merchant → bar horizontal satu seri, digambar dengan div.
 *
 * Sengaja bukan SVG: nama merchant bisa panjang (sumbu kategori SVG akan
 * memotongnya) dan label nominal di ujung bar ikut membungkus jadi dua baris.
 * Dengan div, nama tampil utuh dan nominalnya jadi label langsung yang rapi.
 */
export function MerchantChart({ data }: { data: MerchantTotal[] }) {
  const rows = data.slice(0, 10);
  if (rows.length === 0) return <Empty>Belum ada merchant yang teridentifikasi.</Empty>;

  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <ol className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.merchant}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink-2" title={row.merchant}>
              {row.merchant}
            </span>
            <span className="tabular shrink-0 font-medium text-ink">
              {rupiah(row.total)}
              <span className="ml-1.5 font-normal text-ink-muted">{angka(row.count)}x</span>
            </span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-[4px]"
            style={{ background: "var(--gridline)" }}
            role="img"
            aria-label={`${row.merchant}: ${rupiah(row.total)} dari ${angka(row.count)} transaksi, rata-rata ${rupiah(row.avg)}`}
            title={`rata-rata ${rupiah(row.avg)} per transaksi`}
          >
            <div
              className="h-full rounded-[4px] transition-[width] duration-300"
              style={{
                width: `${Math.max(2, (row.total / max) * 100)}%`,
                background:
                  row.merchant === "Tidak Teridentifikasi" ? "var(--axis)" : "var(--series-1)",
              }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

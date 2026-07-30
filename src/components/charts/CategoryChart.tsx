"use client";

import type { CategoryTotal } from "@/lib/analysis/metrics";
import { persen, rupiah } from "@/lib/format";
import { Empty } from "@/components/ui";

/** Delapan slot kategorikal, dipakai berurutan dan tidak pernah didaur ulang. */
export const SERIES_SLOTS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

export function slotColor(index: number): string {
  return SERIES_SLOTS[Math.min(index, SERIES_SLOTS.length - 1)];
}

/**
 * Perbandingan besaran per kategori → bar horizontal, bukan pie: panjang bar
 * jauh lebih mudah dibandingkan daripada sudut, dan label kategorinya panjang.
 *
 * Bar-nya digambar dengan div, bukan SVG: tidak butuh sumbu, dan setiap bar
 * membawa label nominal langsung (memenuhi "relief rule" untuk tiga warna yang
 * kontrasnya di bawah 3:1 pada surface terang).
 *
 * Catatan soal pemberian warna: slot diberikan menurut peringkat besaran, bukan
 * menurut identitas kategori. Ini kompromi sadar — himpunan kategori yang muncul
 * berbeda tiap file, dan taksonomi punya 19 kategori sedangkan palet cuma 8 slot
 * yang tidak boleh didaur ulang. Konsekuensinya, mengoreksi kategori sebuah
 * transaksi bisa menggeser warna. Yang menahan dampaknya: identitas di sini
 * dibawa oleh emoji + nama yang menempel persis di sebelah bar-nya, bukan oleh
 * warna lewat legend — jadi warna bergeser tidak menghilangkan makna.
 */
export function CategoryChart({ data }: { data: CategoryTotal[] }) {
  if (data.length === 0) return <Empty>Belum ada pengeluaran yang terkategori.</Empty>;

  // Kategori ke-9 dan seterusnya dilipat, supaya warna tidak pernah diulang.
  const head = data.slice(0, 8);
  const tail = data.slice(8);
  const rows =
    tail.length > 0
      ? [
          ...head,
          {
            categoryId: "__other",
            label: `${tail.length} kategori lain`,
            emoji: "•",
            total: tail.reduce((s, c) => s + c.total, 0),
            count: tail.reduce((s, c) => s + c.count, 0),
            share: tail.reduce((s, c) => s + c.share, 0),
          },
        ]
      : head;

  const max = Math.max(...rows.map((r) => r.total), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row, i) => (
        <li key={row.categoryId} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink-2">
              <span aria-hidden className="mr-1">
                {row.emoji}
              </span>
              {row.label}
            </span>
            <span className="tabular shrink-0 font-medium text-ink">
              {rupiah(row.total)}
              <span className="ml-1.5 font-normal text-ink-muted">{persen(row.share)}</span>
            </span>
          </div>
          <div
            className="h-2.5 w-full overflow-hidden rounded-[4px]"
            style={{ background: "var(--gridline)" }}
            role="img"
            aria-label={`${row.label}: ${rupiah(row.total)}, ${persen(row.share)} dari total pengeluaran, ${row.count} transaksi`}
            title={`${row.count} transaksi · rata-rata ${rupiah(row.total / Math.max(1, row.count))}`}
          >
            <div
              className="h-full rounded-[4px] transition-[width] duration-300"
              style={{
                width: `${Math.max(2, (row.total / max) * 100)}%`,
                background: row.categoryId === "__other" ? "var(--axis)" : slotColor(i),
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

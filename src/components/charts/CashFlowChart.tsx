"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthTotal } from "@/lib/analysis/metrics";
import { rupiah, rupiahShort } from "@/lib/format";
import { Empty, Legend, TooltipShell } from "@/components/ui";

/**
 * Arus kas bulanan: dua seri berdampingan (bukan dua sumbu — satu sumbu selalu).
 * Biru = masuk, jingga = keluar; pasangan ini lolos gate CVD sedangkan
 * hijau/merah tidak.
 */
export function CashFlowChart({ data }: { data: MonthTotal[] }) {
  if (data.length === 0) return <Empty>Belum ada data bulanan.</Empty>;

  return (
    <div>
      <Legend
        items={[
          { label: "Pemasukan", color: "var(--flow-in)", marker: "↓" },
          { label: "Pengeluaran", color: "var(--flow-out)", marker: "↑" },
        ]}
      />
      <div className="mt-3 h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke="var(--gridline)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--axis)" }}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              tickFormatter={(v: number) => rupiahShort(v)}
              tickLine={false}
              axisLine={false}
              // fontSize harus diberitahukan ke recharts: dia mengukur lebar teks
              // sendiri, dan kalau tidak tahu ukurannya label ikut dibungkus.
              tick={{ fontSize: 11 }}
              width={76}
            />
            <Tooltip
              cursor={{ fill: "var(--gridline)", opacity: 0.35 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as MonthTotal;
                return (
                  <TooltipShell
                    title={String(label)}
                    rows={[
                      { label: "Pemasukan", value: rupiah(row.income), color: "var(--flow-in)" },
                      { label: "Pengeluaran", value: rupiah(row.expense), color: "var(--flow-out)" },
                      { label: "Selisih", value: rupiah(row.net) },
                    ]}
                  />
                );
              }}
            />
            {/* radius hanya di ujung data, menempel ke baseline. */}
            <Bar dataKey="income" name="Pemasukan" fill="var(--flow-in)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="expense" name="Pengeluaran" fill="var(--flow-out)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

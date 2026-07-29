"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DayTotal } from "@/lib/analysis/metrics";
import { rupiah, rupiahShort, tanggal } from "@/lib/format";
import { Empty, TooltipShell } from "@/components/ui";

/**
 * Saldo harian → area chart satu seri dengan crosshair + tooltip.
 * Hanya digambar kalau kolom saldo memang terbaca dari statement.
 */
export function BalanceChart({ data }: { data: DayTotal[] }) {
  const rows = data.filter((d) => d.balance !== undefined);
  if (rows.length < 2) {
    return <Empty>Kolom saldo tidak terbaca dari file ini, jadi grafik saldo dilewati.</Empty>;
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--gridline)" strokeWidth={1} vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={{ stroke: "var(--axis)" }}
            tickFormatter={(v: string) => tanggal(v).replace(/ \d{4}$/, "")}
            minTickGap={28}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            tickFormatter={(v: number) => rupiahShort(v)}
            tickLine={false}
            axisLine={false}
            // Tanpa fontSize eksplisit, recharts mengukur pakai ukuran default
            // dan membungkus "Rp10,5 jt" jadi dua baris.
            tick={{ fontSize: 11 }}
            width={76}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as DayTotal;
              return (
                <TooltipShell
                  title={tanggal(row.date)}
                  rows={[
                    { label: "Saldo", value: rupiah(row.balance ?? 0), color: "var(--series-1)" },
                    { label: "Masuk", value: rupiah(row.income) },
                    { label: "Keluar", value: rupiah(row.expense) },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="var(--series-1)"
            strokeWidth={2}
            fill="url(#balanceFill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

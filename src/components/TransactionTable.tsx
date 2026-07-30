"use client";

import { useMemo, useState } from "react";
import type { Transaction } from "@/lib/types";
import { CATEGORIES, getCategory } from "@/lib/qris/categories";
import { rupiah, tanggal } from "@/lib/format";
import { Badge } from "@/components/ui";

const SOURCE_LABEL: Record<Transaction["source"], string> = {
  dictionary: "Kamus",
  rule: "Rule",
  ai: "AI",
  manual: "Manual",
  unknown: "Belum jelas",
};

export function TransactionTable({
  transactions,
  onCategoryChange,
}: {
  transactions: Transaction[];
  onCategoryChange: (id: string, categoryId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [direction, setDirection] = useState<"all" | "debit" | "credit">("all");
  const [onlyUnclear, setOnlyUnclear] = useState(false);
  const [sourceFile, setSourceFile] = useState("all");
  const [limit, setLimit] = useState(50);

  // Filter per file hanya muncul kalau memang ada beberapa file yang digabung.
  const sourceFiles = useMemo(() => {
    const names = new Set<string>();
    for (const t of transactions) if (t.sourceFile) names.add(t.sourceFile);
    return [...names].sort();
  }, [transactions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (category !== "all" && t.category !== category) return false;
      if (direction !== "all" && t.direction !== direction) return false;
      if (sourceFile !== "all" && t.sourceFile !== sourceFile) return false;
      if (onlyUnclear && t.confidence >= 0.6 && t.source !== "unknown") return false;
      if (!q) return true;
      return (
        t.description.toLowerCase().includes(q) ||
        (t.merchant ?? "").toLowerCase().includes(q) ||
        getCategory(t.category).label.toLowerCase().includes(q)
      );
    });
  }, [transactions, query, category, direction, onlyUnclear, sourceFile]);

  const visible = filtered.slice(0, limit);

  function exportCsv() {
    const header = [
      "tanggal", "keterangan", "merchant", "kategori", "arah", "nominal", "saldo", "sumber",
      "keyakinan", "file",
    ];
    const rows = filtered.map((t) => [
      t.date,
      t.description.replace(/"/g, '""'),
      (t.merchant ?? "").replace(/"/g, '""'),
      getCategory(t.category).label,
      t.direction === "debit" ? "keluar" : "masuk",
      String(Math.round(t.amount)),
      t.balance !== undefined ? String(Math.round(t.balance)) : "",
      SOURCE_LABEL[t.source],
      t.confidence.toFixed(2),
      t.sourceFile ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(","))
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transaksi-terkategori.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Filter dalam satu baris di atas tabel. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 no-print">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari merchant atau keterangan…"
          className="min-w-[200px] flex-1 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs text-ink outline-none placeholder:text-ink-muted focus:border-[color:var(--series-1)]"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-[color:var(--series-1)]"
        >
          <option value="all">Semua kategori</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as typeof direction)}
          className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-[color:var(--series-1)]"
        >
          <option value="all">Masuk & keluar</option>
          <option value="debit">Keluar</option>
          <option value="credit">Masuk</option>
        </select>
        {sourceFiles.length > 1 ? (
          <select
            value={sourceFile}
            onChange={(e) => setSourceFile(e.target.value)}
            aria-label="Filter berdasarkan file asal"
            className="max-w-[180px] rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-xs text-ink outline-none focus:border-[color:var(--series-1)]"
          >
            <option value="all">Semua file</option>
            {sourceFiles.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : null}
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input
            type="checkbox"
            checked={onlyUnclear}
            onChange={(e) => setOnlyUnclear(e.target.checked)}
            className="h-3.5 w-3.5 accent-[color:var(--series-1)]"
          />
          Hanya yang belum jelas
        </label>
        <button
          type="button"
          onClick={exportCsv}
          className="ml-auto rounded-lg border border-hairline px-3 py-1.5 text-xs font-medium text-ink-2 transition-colors hover:bg-[color:var(--gridline)]"
        >
          Ekspor CSV
        </button>
      </div>

      <p className="mb-2 text-xs text-ink-muted">
        Menampilkan {visible.length} dari {filtered.length} transaksi
        {filtered.length !== transactions.length ? ` (total ${transactions.length})` : ""}.
      </p>

      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead>
            <tr className="border-b border-hairline bg-[color:var(--page-plane)] text-ink-muted">
              <th className="px-3 py-2 font-medium">Tanggal</th>
              <th className="px-3 py-2 font-medium">Merchant</th>
              <th className="px-3 py-2 font-medium">Keterangan asli</th>
              <th className="px-3 py-2 font-medium">Kategori</th>
              <th className="px-3 py-2 text-right font-medium">Nominal</th>
              <th className="px-3 py-2 font-medium">Sumber</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id} className="border-b border-hairline last:border-0 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                  <span className="tabular">{tanggal(t.date)}</span>
                  {sourceFiles.length > 1 && t.sourceFile ? (
                    <span
                      className="mt-0.5 block max-w-[120px] truncate text-[10px] text-ink-muted"
                      title={t.sourceFile}
                    >
                      {t.sourceFile}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <span className="font-medium text-ink">{t.merchant ?? "—"}</span>
                  {t.qris?.nmid || t.qris?.mpan ? (
                    <span className="tabular mt-0.5 block text-[10px] text-ink-muted">
                      {t.qris.nmid ?? t.qris.mpan}
                    </span>
                  ) : null}
                </td>
                <td className="max-w-[260px] px-3 py-2 text-ink-muted">
                  <span className="line-clamp-2 break-words">{t.description}</span>
                  {t.note ? (
                    <span className="mt-0.5 block text-[10px] italic text-ink-muted">{t.note}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={t.category}
                    onChange={(e) => onCategoryChange(t.id, e.target.value)}
                    aria-label={`Kategori untuk transaksi ${tanggal(t.date)}`}
                    className="max-w-[150px] rounded border border-hairline bg-surface px-1.5 py-1 text-[11px] text-ink outline-none focus:border-[color:var(--series-1)]"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="tabular whitespace-nowrap px-3 py-2 text-right">
                  <span className="font-medium text-ink">
                    <span
                      aria-hidden
                      className="mr-1 text-ink-muted"
                      style={{ color: t.direction === "credit" ? "var(--flow-in)" : "var(--flow-out)" }}
                    >
                      {t.direction === "credit" ? "↓" : "↑"}
                    </span>
                    {rupiah(t.amount)}
                  </span>
                  <span className="sr-only">{t.direction === "credit" ? " masuk" : " keluar"}</span>
                  {t.balance !== undefined ? (
                    <span className="mt-0.5 block text-[10px] text-ink-muted">
                      saldo {rupiah(t.balance)}
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <Badge
                    tone={
                      t.source === "unknown"
                        ? "critical"
                        : t.confidence >= 0.85
                          ? "good"
                          : t.confidence >= 0.6
                            ? "neutral"
                            : "warning"
                    }
                  >
                    {SOURCE_LABEL[t.source]}
                    <span className="tabular opacity-70">{Math.round(t.confidence * 100)}%</span>
                  </Badge>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-muted">
                  Tidak ada transaksi yang cocok dengan filter ini.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {filtered.length > visible.length ? (
        <button
          type="button"
          onClick={() => setLimit((l) => l + 100)}
          className="mt-3 w-full rounded-lg border border-hairline py-2 text-xs font-medium text-ink-2 transition-colors hover:bg-[color:var(--gridline)] no-print"
        >
          Tampilkan 100 lagi
        </button>
      ) : null}
    </div>
  );
}

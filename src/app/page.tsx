"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EnrichItem, EnrichResult, ParseResult, Transaction } from "@/lib/types";
import { Uploader } from "@/components/Uploader";
import { Dashboard } from "@/components/Dashboard";
import { Card, CardHeader } from "@/components/ui";
import { angka } from "@/lib/format";
import { dedupKey } from "@/lib/ai/dedup";

type ParseResponse = ParseResult & { aiAvailable: boolean };

/** Koreksi kategori manual disimpan per pola keterangan, bukan per id transaksi,
 *  supaya perbaikan sekali langsung berlaku untuk merchant yang sama di file lain. */
const OVERRIDE_KEY = "estatement-category-overrides-v1";

function loadOverrides(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveOverrides(map: Record<string, string>) {
  try {
    window.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(map));
  } catch {
    // localStorage penuh atau diblokir — tidak fatal, koreksi cuma tidak persist.
  }
}

export default function Home() {
  const [parse, setParse] = useState<ParseResponse | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [aiState, setAiState] = useState<{
    running: boolean;
    done: boolean;
    updated: number;
    errors: string[];
  }>({ running: false, done: false, updated: 0, errors: [] });

  useEffect(() => {
    setOverrides(loadOverrides());
  }, []);

  /** Terapkan koreksi manual yang tersimpan ke daftar transaksi. */
  const applyOverrides = useCallback(
    (list: Transaction[], map: Record<string, string>): Transaction[] =>
      list.map((t) => {
        const key = dedupKey(t.description);
        const category = map[key];
        if (!category || category === t.category) return t;
        return { ...t, category, source: "manual" as const, confidence: 1, note: "Dikoreksi manual" };
      }),
    [],
  );

  const runEnrich = useCallback(
    async (list: Transaction[]) => {
      const pending = list.filter(
        (t) => t.source === "unknown" || (t.source !== "manual" && t.confidence < 0.6),
      );
      if (pending.length === 0) {
        setAiState({ running: false, done: true, updated: 0, errors: [] });
        return list;
      }

      setAiState({ running: true, done: false, updated: 0, errors: [] });
      setStatus(`AI menganalisa ${pending.length} transaksi…`);

      const items: EnrichItem[] = pending.map((t) => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.date,
        direction: t.direction,
        qris: t.qris,
      }));

      // Dipecah supaya request tidak pernah kelewat besar/lama.
      const CHUNK = 300;
      const results: EnrichResult[] = [];
      const errors: string[] = [];

      for (let i = 0; i < items.length; i += CHUNK) {
        const slice = items.slice(i, i + CHUNK);
        try {
          const res = await fetch("/api/enrich", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: slice }),
          });
          const data = await res.json();
          if (!res.ok) {
            errors.push(data.error ?? `HTTP ${res.status}`);
            continue;
          }
          results.push(...(data.results as EnrichResult[]));
          if (Array.isArray(data.errors)) errors.push(...(data.errors as string[]));
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }

      const byId = new Map(results.map((r) => [r.id, r]));
      const updated = list.map((t) => {
        const hit = byId.get(t.id);
        if (!hit || t.source === "manual") return t;
        return {
          ...t,
          merchant: hit.merchant,
          category: hit.category,
          confidence: hit.confidence,
          source: "ai" as const,
          note: hit.note,
        };
      });

      setAiState({ running: false, done: true, updated: results.length, errors });
      setStatus(undefined);
      return updated;
    },
    [],
  );

  const handleFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(undefined);
      setStatus("Membaca file…");
      setParse(null);
      setTransactions([]);
      setAiState({ running: false, done: false, updated: 0, errors: [] });

      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/parse", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? `Gagal memproses file (HTTP ${res.status}).`);
          return;
        }

        const result = data as ParseResponse;
        const current = loadOverrides();
        setOverrides(current);
        let list = applyOverrides(result.transactions, current);
        setParse(result);
        setTransactions(list);

        if (result.aiAvailable) {
          list = await runEnrich(list);
          setTransactions(applyOverrides(list, current));
        } else {
          setAiState({
            running: false,
            done: true,
            updated: 0,
            errors: ["ANTHROPIC_API_KEY belum diset, jadi AI analyzer tidak dijalankan."],
          });
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kesalahan tak terduga.");
      } finally {
        setBusy(false);
        setStatus(undefined);
      }
    },
    [applyOverrides, runEnrich],
  );

  const handleCategoryChange = useCallback(
    (id: string, categoryId: string) => {
      const target = transactions.find((t) => t.id === id);
      if (!target) return;
      const key = dedupKey(target.description);

      // Efek samping (localStorage) dikerjakan di luar updater setState —
      // updater harus murni, karena React boleh memanggilnya lebih dari sekali.
      const nextOverrides = { ...overrides, [key]: categoryId };
      setOverrides(nextOverrides);
      saveOverrides(nextOverrides);

      // Koreksi berlaku untuk semua transaksi dengan pola keterangan yang sama,
      // bukan hanya baris yang diklik.
      setTransactions((prev) =>
        prev.map((t) =>
          dedupKey(t.description) === key
            ? {
                ...t,
                category: categoryId,
                source: "manual" as const,
                confidence: 1,
                note: "Dikoreksi manual",
              }
            : t,
        ),
      );
    },
    [overrides, transactions],
  );

  const reset = useCallback(() => {
    setParse(null);
    setTransactions([]);
    setError(undefined);
    setAiState({ running: false, done: false, updated: 0, errors: [] });
  }, []);

  const aiPanel = useMemo(() => {
    if (!parse) return null;
    if (!aiState.running && !aiState.done) return null;

    const hasErrors = aiState.errors.length > 0;
    return (
      <Card>
        <CardHeader
          title="AI analyzer"
          subtitle={
            aiState.running
              ? "Menebak merchant dan kategori dari kode QRIS…"
              : `${angka(aiState.updated)} transaksi diperkaya oleh AI`
          }
        />
        {aiState.running ? (
          <div className="h-1 w-full overflow-hidden rounded-full bg-[color:var(--gridline)]">
            <div
              className="h-full w-1/3 animate-pulse rounded-full"
              style={{ background: "var(--series-1)" }}
            />
          </div>
        ) : null}
        {hasErrors ? (
          <ul className="mt-2 space-y-1">
            {aiState.errors.map((e, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] text-ink-2">
                <span aria-hidden style={{ color: "var(--status-warning)" }}>
                  !
                </span>
                <span>{e}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {!aiState.running && !hasErrors && aiState.updated === 0 ? (
          <p className="text-xs text-ink-muted">
            Semua transaksi sudah bisa dikenali tanpa AI — kamus merchant dan aturan rule-based
            sudah cukup.
          </p>
        ) : null}
      </Card>
    );
  }, [parse, aiState]);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
      {!parse ? (
        <div className="mx-auto max-w-2xl">
          <header className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-ink">Analisa E-Statement Bank</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-2">
              Upload e-statement PDF atau CSV. Kode QRIS yang cuma berisi angka panjang akan
              ditebak merchant dan kategorinya, lalu semuanya dijadikan visualisasi dan analisa
              detail.
            </p>
          </header>

          <Uploader onFile={handleFile} busy={busy} status={status} />

          {error ? (
            <div
              className="mt-4 rounded-lg border p-3 text-xs"
              style={{ borderColor: "var(--status-critical)", color: "var(--status-critical)" }}
            >
              <span aria-hidden className="mr-1 font-semibold">
                ✕
              </span>
              {error}
            </div>
          ) : null}

          <section className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              {
                title: "Baca PDF & CSV",
                body: "Parser tahu layout kolom debit/kredit per bank, dan mengoreksi arah dana dari selisih saldo berjalan.",
              },
              {
                title: "Tebak merchant QRIS",
                body: "Kamus merchant Indonesia dulu (gratis), sisanya baru diserahkan ke Claude — hemat dan cepat.",
              },
              {
                title: "Analisa mendetail",
                body: "Arus kas, kategori, langganan berulang, anomali, laju pengeluaran, sampai pola per hari.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-hairline bg-surface p-4">
                <h2 className="text-xs font-semibold text-ink">{f.title}</h2>
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">{f.body}</p>
              </div>
            ))}
          </section>
        </div>
      ) : (
        <Dashboard
          parse={parse}
          transactions={transactions}
          onCategoryChange={handleCategoryChange}
          onReset={reset}
          aiPanel={aiPanel}
        />
      )}
    </main>
  );
}

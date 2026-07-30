"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EnrichItem, EnrichResult, ParseResult, Transaction } from "@/lib/types";
import { Uploader } from "@/components/Uploader";
import { Dashboard } from "@/components/Dashboard";
import { Card, CardHeader } from "@/components/ui";
import { angka } from "@/lib/format";
import { dedupKey, ENRICH_MAX_ITEMS } from "@/lib/ai/dedup";
import { mergeStatements, type MergedStatement } from "@/lib/analysis/merge";

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

/**
 * Transaksi yang layak dikirim ke AI. Sengaja tidak memakai helper dari
 * lib/parse supaya modul itu (yang menarik pdfjs) tidak masuk bundle browser.
 */
function shouldEnrich(t: Transaction): boolean {
  if (t.noMerchantInfo) return false;
  if (t.source === "manual" || t.source === "ai") return false;
  return t.source === "unknown" || t.confidence < 0.6;
}

export default function Home() {
  const [merged, setMerged] = useState<MergedStatement | null>(null);
  const [aiAvailable, setAiAvailable] = useState(false);
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

  const runEnrich = useCallback(async (list: Transaction[]) => {
    const pending = list.filter(shouldEnrich);
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

    // Dipecah sesuai batas yang diterima route-nya, supaya tidak ada request
    // yang ditolak 413 atau kena batas durasi function.
    const results: EnrichResult[] = [];
    const errors: string[] = [];

    for (let i = 0; i < items.length; i += ENRICH_MAX_ITEMS) {
      const slice = items.slice(i, i + ENRICH_MAX_ITEMS);
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
  }, []);

  const handleFiles = useCallback(
    async (files: File[]) => {
      setBusy(true);
      setError(undefined);
      setMerged(null);
      setTransactions([]);
      setAiState({ running: false, done: false, updated: 0, errors: [] });

      try {
        const results: ParseResult[] = [];
        const failures: string[] = [];
        let anyAiAvailable = false;

        // Diproses satu per satu supaya progresnya kelihatan dan satu file yang
        // gagal tidak menggagalkan yang lain.
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setStatus(
            files.length > 1
              ? `Membaca file ${i + 1} dari ${files.length}: ${file.name}…`
              : "Membaca file…",
          );
          try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch("/api/parse", { method: "POST", body: form });
            const data = await res.json();
            if (!res.ok) {
              failures.push(`${file.name}: ${data.error ?? `HTTP ${res.status}`}`);
              continue;
            }
            const parsed = data as ParseResult & { aiAvailable: boolean };
            anyAiAvailable = anyAiAvailable || parsed.aiAvailable;
            results.push(parsed);
          } catch (e) {
            failures.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        if (results.length === 0) {
          setError(
            failures.length > 0
              ? failures.join(" · ")
              : "Tidak ada file yang berhasil dibaca.",
          );
          return;
        }

        const combined = mergeStatements(results);
        for (const f of failures) {
          combined.warnings.push({ level: "warn", message: f });
        }

        const current = loadOverrides();
        setOverrides(current);
        let list = applyOverrides(combined.transactions, current);
        setMerged(combined);
        setAiAvailable(anyAiAvailable);
        setTransactions(list);

        if (anyAiAvailable) {
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
    setMerged(null);
    setTransactions([]);
    setError(undefined);
    setAiState({ running: false, done: false, updated: 0, errors: [] });
  }, []);

  const aiPanel = useMemo(() => {
    if (!merged) return null;
    if (!aiState.running && !aiState.done) return null;

    const hasErrors = aiState.errors.length > 0;
    const skipped = merged.noMerchantInfo;

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

        {!aiState.running && skipped > 0 ? (
          <p className="text-xs leading-relaxed text-ink-2">
            <strong>{angka(skipped)} transaksi QRIS</strong> tidak dikirim ke AI karena
            keterangannya di statement memang hanya berisi kode transaksi dan merchant PAN —
            tidak ada nama merchant sama sekali, jadi tidak ada yang bisa ditebak. Ini batasan
            ekspor dari banknya, bukan hasil analisa yang gagal.
          </p>
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

        {!aiState.running && !hasErrors && aiState.updated === 0 && skipped === 0 ? (
          <p className="text-xs text-ink-muted">
            Semua transaksi sudah bisa dikenali tanpa AI — kamus merchant dan aturan rule-based
            sudah cukup.
          </p>
        ) : null}
      </Card>
    );
  }, [merged, aiState]);

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
      {!merged ? (
        <div className="mx-auto max-w-2xl">
          <header className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-ink">Analisa E-Statement Bank</h1>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-ink-2">
              Upload e-statement PDF atau CSV — satu file atau beberapa bulan sekaligus. Kode QRIS
              yang cuma berisi angka panjang akan ditebak merchant dan kategorinya, lalu semuanya
              dijadikan visualisasi dan analisa detail.
            </p>
          </header>

          <Uploader onFiles={handleFiles} busy={busy} status={status} />

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
                title: "Gabung beberapa bulan",
                body: "Upload beberapa file sekaligus. Periode yang tumpang tindih dideteksi dan transaksi gandanya dibuang.",
              },
              {
                title: "Tebak merchant QRIS",
                body: "Kamus merchant Indonesia dulu (gratis), sisanya baru diserahkan ke Claude — hemat dan cepat.",
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
          merged={merged}
          transactions={transactions}
          onCategoryChange={handleCategoryChange}
          onReset={reset}
          aiPanel={aiPanel}
          aiAvailable={aiAvailable}
        />
      )}
    </main>
  );
}

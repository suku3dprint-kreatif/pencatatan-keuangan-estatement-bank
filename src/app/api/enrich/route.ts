import { NextResponse } from "next/server";
import { enrichTransactions, isAiConfigured } from "@/lib/ai/enrich";
import type { EnrichItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Batas jumlah transaksi per panggilan, supaya request tidak pernah kelewat lama. */
const MAX_ITEMS = 400;

export async function GET() {
  return NextResponse.json({ aiAvailable: isAiConfigured() });
}

export async function POST(request: Request) {
  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY belum diset di .env.local, jadi AI analyzer tidak bisa dipakai. Hasil rule-based tetap tersedia.",
      },
      { status: 503 },
    );
  }

  let body: { items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body harus JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "Field `items` harus array." }, { status: 400 });
  }
  if (body.items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Terlalu banyak transaksi sekaligus (maksimal ${MAX_ITEMS}).` },
      { status: 413 },
    );
  }

  const items: EnrichItem[] = [];
  for (const raw of body.items as Record<string, unknown>[]) {
    if (typeof raw?.id !== "string" || typeof raw?.description !== "string") continue;
    items.push({
      id: raw.id,
      description: raw.description.slice(0, 300),
      amount: typeof raw.amount === "number" ? raw.amount : 0,
      date: typeof raw.date === "string" ? raw.date : "",
      direction: raw.direction === "credit" ? "credit" : "debit",
      qris:
        raw.qris && typeof raw.qris === "object"
          ? (raw.qris as EnrichItem["qris"])
          : undefined,
    });
  }

  try {
    const outcome = await enrichTransactions(items);
    return NextResponse.json(outcome);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan tak terduga.";
    console.error("[enrich] gagal:", error);
    return NextResponse.json({ error: `AI analyzer gagal: ${message}` }, { status: 500 });
  }
}

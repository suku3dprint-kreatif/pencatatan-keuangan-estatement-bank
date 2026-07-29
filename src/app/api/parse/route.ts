import { NextResponse } from "next/server";
import { parseStatement } from "@/lib/parse";
import { isAiConfigured } from "@/lib/ai/enrich";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Body bukan multipart/form-data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File tidak ditemukan di field `file`." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File kosong." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File terlalu besar (maksimal ${MAX_BYTES / 1024 / 1024} MB).` },
      { status: 413 },
    );
  }

  const name = file.name.toLowerCase();
  const allowed = [".pdf", ".csv", ".txt", ".tsv"];
  if (!allowed.some((ext) => name.endsWith(ext))) {
    return NextResponse.json(
      { error: "Format tidak didukung. Pakai PDF atau CSV." },
      { status: 415 },
    );
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await parseStatement({ fileName: file.name, bytes });
    return NextResponse.json({ ...result, aiAvailable: isAiConfigured() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kesalahan tak terduga.";
    console.error("[parse] gagal:", error);
    return NextResponse.json(
      { error: `Gagal membaca file: ${message}` },
      { status: 500 },
    );
  }
}

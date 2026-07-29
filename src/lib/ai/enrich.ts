import Anthropic from "@anthropic-ai/sdk";
import type { EnrichItem, EnrichResult } from "@/lib/types";
import { CATEGORY_IDS, categoryPromptBlock, isCategoryId } from "@/lib/qris/categories";
import { dedupKey } from "./dedup";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
const EFFORT = (process.env.ANTHROPIC_EFFORT ?? "medium") as
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

/** Jumlah transaksi per panggilan API. Cukup besar untuk hemat, cukup kecil untuk akurat. */
const BATCH_SIZE = 30;
/** Berapa batch yang jalan bersamaan. */
const CONCURRENCY = 3;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Bagian prompt yang tidak pernah berubah antar-request, jadi bisa di-cache.
 * Prompt caching butuh prefix stabil — jangan pernah selipkan tanggal, ID,
 * atau apa pun yang berbeda tiap panggilan di sini.
 */
const SYSTEM_PROMPT = `Kamu adalah analis transaksi perbankan Indonesia. Tugasmu: dari keterangan mutasi rekening yang ringkas dan penuh kode, tebak (a) nama merchant / lawan transaksi yang manusiawi, dan (b) kategori pengeluarannya.

Konteks penting soal QRIS di Indonesia:
- Keterangan QRIS sering hanya berisi "QRIS", kode NMID (format ID + 13 digit), Terminal ID, nomor referensi panjang, dan potongan nama merchant yang terpotong atau disingkat.
- Nama merchant di QRIS sering ditulis singkat, tanpa spasi, atau dengan sufiks lokasi/cabang. Contoh: "WRG MKN BU SRI CAB 2" = Warung Makan Bu Sri, "AMDK TIRTA JAYA" = toko air minum, "SPBU 34-12102" = SPBU Pertamina.
- Singkatan yang sering muncul: WRG/WRUNG = warung, TK/TOKO = toko, RM = rumah makan, AYM = ayam, MKN = makan, MNM = minum, KLINIK/APT = apotek/klinik, PT/CV = badan usaha (biasanya bukan nama merchant yang dikenal konsumen).
- Nama orang di keterangan transfer (mis. "BUDI SANTOSO") berarti transfer antar-orang, bukan merchant.
- Prefix bank yang harus diabaikan sebagai nama merchant: TRSF, E-BANKING, BIFAST, SWITCHING, RTGS, SKN, LLG, DB, CR, SA, WS, FTSCY, NBMB.

Kategori yang tersedia (pakai HANYA id ini):
${categoryPromptBlock()}

Aturan output:
1. \`merchant\`: nama yang bisa dibaca manusia dalam Title Case, maksimal 40 karakter. Kalau nama merchant benar-benar tidak bisa ditebak, tulis deskripsi jenis usahanya (mis. "Warung Makan", "Toko Kelontong", "Merchant QRIS Tidak Dikenal"). Jangan pernah mengembalikan kode mentah, NMID, atau nomor referensi sebagai nama merchant.
2. \`category\`: satu id dari daftar di atas. Jangan mengarang id baru.
3. \`confidence\`: 0.0–1.0. Jujur. Pakai di bawah 0.5 kalau kamu memang cuma menebak dari pola samar, dan di atas 0.85 hanya kalau nama merchantnya jelas terbaca.
4. \`note\`: satu frasa singkat bahasa Indonesia yang menjelaskan dasar tebakanmu (maksimal 60 karakter).
5. Arah dana sudah diberikan: "debit" = uang keluar, "credit" = uang masuk. Transaksi credit tidak mungkin berkategori pengeluaran seperti makan_minum — pakai pendapatan atau transfer_masuk.
6. Balas untuk SETIAP id yang diberikan, dengan id yang sama persis. Jangan menambah atau menghilangkan id.`;

const RESULT_SCHEMA = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          merchant: { type: "string" },
          category: { type: "string", enum: CATEGORY_IDS },
          confidence: { type: "number" },
          note: { type: "string" },
        },
        required: ["id", "merchant", "category", "confidence", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["results"],
  additionalProperties: false,
} as const;

interface BatchPayloadItem {
  id: string;
  keterangan: string;
  nominal: number;
  arah: string;
  tanggal: string;
  qris?: Record<string, string>;
}

function buildBatchPayload(items: EnrichItem[]): BatchPayloadItem[] {
  return items.map((item) => {
    const payload: BatchPayloadItem = {
      id: item.id,
      keterangan: item.description,
      nominal: Math.round(item.amount),
      arah: item.direction,
      tanggal: item.date,
    };
    if (item.qris) {
      const q: Record<string, string> = {};
      if (item.qris.nmid) q.nmid = item.qris.nmid;
      if (item.qris.acquirer) q.acquirer = item.qris.acquirer;
      if (item.qris.nameHint) q.sisa_teks = item.qris.nameHint;
      if (Object.keys(q).length > 0) payload.qris = q;
    }
    return payload;
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function classifyBatch(client: Anthropic, items: EnrichItem[]): Promise<EnrichResult[]> {
  const payload = buildBatchPayload(items);

  // Streaming dipakai karena batch besar bisa menghasilkan output panjang;
  // tanpa streaming, request berisiko kena timeout HTTP.
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: RESULT_SCHEMA },
    },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        // Prefix stabil → panggilan batch berikutnya baca dari cache.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Klasifikasikan ${payload.length} transaksi berikut:\n\n${JSON.stringify(payload, null, 1)}`,
      },
    ],
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("Permintaan ditolak oleh filter keamanan model.");
  }

  const text = message.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Model tidak mengembalikan teks JSON.");
  }

  let parsed: { results?: unknown };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new Error("Output model bukan JSON yang valid.");
  }
  if (!Array.isArray(parsed.results)) {
    throw new Error("Output model tidak berisi array `results`.");
  }

  const validIds = new Set(items.map((i) => i.id));
  const out: EnrichResult[] = [];
  for (const row of parsed.results as Record<string, unknown>[]) {
    const id = typeof row.id === "string" ? row.id : "";
    if (!validIds.has(id)) continue;
    const category = typeof row.category === "string" && isCategoryId(row.category) ? row.category : "lainnya";
    const merchant = typeof row.merchant === "string" && row.merchant.trim() ? row.merchant.trim().slice(0, 60) : "Tidak Teridentifikasi";
    const rawConfidence = typeof row.confidence === "number" ? row.confidence : 0.5;
    out.push({
      id,
      merchant,
      category,
      confidence: Math.max(0, Math.min(1, rawConfidence)),
      note: typeof row.note === "string" ? row.note.slice(0, 120) : undefined,
    });
  }
  return out;
}

export interface EnrichOutcome {
  results: EnrichResult[];
  /** Batch yang gagal — transaksinya tetap memakai hasil rule-based. */
  errors: string[];
  usage: { batches: number; cachedBatches: number };
}

/**
 * Klasifikasi transaksi yang belum teridentifikasi memakai Claude.
 *
 * Deduplikasi dilakukan lewat kunci keterangan yang dinormalisasi: kalau kamu
 * belanja di Indomaret 40 kali, merchant itu hanya dikirim sekali ke API dan
 * hasilnya dipakai ulang untuk ke-39 transaksi lainnya.
 */
export async function enrichTransactions(items: EnrichItem[]): Promise<EnrichOutcome> {
  if (items.length === 0) return { results: [], errors: [], usage: { batches: 0, cachedBatches: 0 } };
  if (!isAiConfigured()) {
    return {
      results: [],
      errors: ["ANTHROPIC_API_KEY belum diset — AI analyzer dilewati."],
      usage: { batches: 0, cachedBatches: 0 },
    };
  }

  const client = new Anthropic();

  // Dedup: satu perwakilan per keterangan unik.
  const groups = new Map<string, EnrichItem[]>();
  for (const item of items) {
    const key = dedupKey(item.description);
    const bucket = groups.get(key);
    if (bucket) bucket.push(item);
    else groups.set(key, [item]);
  }
  const representatives = [...groups.values()].map((g) => g[0]);

  const batches = chunk(representatives, BATCH_SIZE);
  const results: EnrichResult[] = [];
  const errors: string[] = [];

  // Jalankan beberapa batch paralel, tapi dibatasi supaya tidak kena rate limit.
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const slice = batches.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(slice.map((b) => classifyBatch(client, b)));
    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") {
        results.push(...res.value);
      } else {
        const reason = res.reason instanceof Error ? res.reason.message : String(res.reason);
        errors.push(`Batch ${i + idx + 1}: ${reason}`);
      }
    });
  }

  // Sebarkan hasil perwakilan ke seluruh anggota grupnya.
  const byRepId = new Map(results.map((r) => [r.id, r]));
  const expanded: EnrichResult[] = [];
  for (const group of groups.values()) {
    const rep = byRepId.get(group[0].id);
    if (!rep) continue;
    for (const member of group) {
      expanded.push({ ...rep, id: member.id });
    }
  }

  return {
    results: expanded,
    errors,
    usage: { batches: batches.length, cachedBatches: Math.max(0, batches.length - 1) },
  };
}

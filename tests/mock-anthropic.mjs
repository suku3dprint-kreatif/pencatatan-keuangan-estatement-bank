/**
 * Mock Anthropic Messages API untuk menguji jalur AI analyzer tanpa API key.
 *
 * Jalankan mock ini, lalu arahkan aplikasi ke sini:
 *   ANTHROPIC_API_KEY=mock ANTHROPIC_BASE_URL=http://localhost:3222 npm run dev
 *
 * Mock membalas SSE dengan bentuk yang sama seperti API sungguhan, berisi JSON
 * sesuai skema structured output yang diminta aplikasi.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 3222);

/** Tebakan sederhana supaya balasan mock terasa realistis. */
function guess(keterangan) {
  const k = keterangan.toUpperCase();
  if (/WRG|WARUNG|MKN|NASI|AYM|GEPREK/.test(k))
    return { merchant: "Warung Makan Bu Sri", category: "makan_minum", note: "Singkatan WRG MKN" };
  if (/AMDK|TIRTA|AIR/.test(k))
    return { merchant: "Depot Air Tirta Jaya", category: "groceries", note: "AMDK = air minum" };
  if (/TK |TOKO|BANGUNAN|MAJU/.test(k))
    return { merchant: "Toko Bangunan Maju", category: "rumah_tangga", note: "TK = toko" };
  return { merchant: "Merchant QRIS Tidak Dikenal", category: "lainnya", note: "Tidak ada petunjuk" };
}

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (!req.url?.startsWith("/v1/messages")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: "no" } }));
      return;
    }

    let request;
    try {
      request = JSON.parse(body);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }

    // Ambil daftar transaksi dari pesan user (aplikasi mengirimnya sebagai JSON).
    const userText = request.messages?.[0]?.content ?? "";
    const jsonStart = userText.indexOf("[");
    let items = [];
    try {
      items = JSON.parse(userText.slice(jsonStart));
    } catch {
      items = [];
    }

    console.log(
      `[mock] model=${request.model} effort=${request.output_config?.effort} ` +
        `thinking=${request.thinking?.type} cache=${Boolean(request.system?.[0]?.cache_control)} ` +
        `schema=${Boolean(request.output_config?.format)} items=${items.length}`,
    );

    const results = items.map((it) => {
      const g = guess(it.keterangan ?? "");
      return { id: it.id, ...g, confidence: 0.78 };
    });
    const payload = JSON.stringify({ results });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const send = (event, data) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    send("message_start", {
      type: "message_start",
      message: {
        id: "msg_mock",
        type: "message",
        role: "assistant",
        model: request.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 500, output_tokens: 0, cache_read_input_tokens: 400 },
      },
    });
    send("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    });
    // Dipecah beberapa delta supaya menguji perakitan stream, bukan satu blok.
    for (let i = 0; i < payload.length; i += 400) {
      send("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: payload.slice(i, i + 400) },
      });
    }
    send("content_block_stop", { type: "content_block_stop", index: 0 });
    send("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: payload.length / 4 },
    });
    send("message_stop", { type: "message_stop" });
    res.end();
  });
});

server.listen(PORT, () => console.log(`[mock] Anthropic mock siap di http://localhost:${PORT}`));

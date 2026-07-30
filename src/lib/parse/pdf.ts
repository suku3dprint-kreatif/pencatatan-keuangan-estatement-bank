import type { ExtractedLine, TextCell } from "./engine";

/**
 * Ekstraksi teks PDF beserta posisi horizontalnya.
 *
 * Posisi x-nya penting: statement Mandiri/BRI/BNI memakai kolom debit dan
 * kredit yang terpisah tanpa penanda DB/CR, jadi satu-satunya cara membedakan
 * uang masuk dan keluar adalah dari kolom mana angkanya berada.
 */
export interface PdfExtraction {
  lines: ExtractedLine[];
  pages: number;
}

/** Toleransi selisih koordinat y yang masih dianggap satu baris (dalam pt). */
const ROW_TOLERANCE = 3;

/**
 * Lokasi font standar bawaan pdfjs. Path-nya dirakit saat runtime dari
 * `process.cwd()` — kalau ditulis sebagai literal di `new URL(...)`, bundler
 * Next akan mencoba me-resolve-nya saat build dan gagal.
 */
function standardFontDir(): string {
  return `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`;
}

export async function extractPdf(data: Uint8Array): Promise<PdfExtraction> {
  // Import dinamis: build "legacy" adalah satu-satunya yang jalan di Node.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const doc = await pdfjs.getDocument({
    data,
    // Tanpa worker & tanpa eval — aman untuk dijalankan di server route.
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    // Tanpa ini pdfjs memuntahkan warning per file; tidak memengaruhi hasil
    // ekstraksi teks, tapi bikin log server berisik.
    standardFontDataUrl: standardFontDir(),
  }).promise;

  const lines: ExtractedLine[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();

    // Kelompokkan potongan teks per koordinat y.
    const rows: { y: number; cells: TextCell[] }[] = [];
    for (const item of content.items) {
      if (!("str" in item)) continue;
      if (!item.str || !item.str.trim()) continue;
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;

      let row = rows.find((r) => Math.abs(r.y - y) <= ROW_TOLERANCE);
      if (!row) {
        row = { y, cells: [] };
        rows.push(row);
      }
      row.cells.push({ str: item.str, x });
    }

    // Urutkan atas → bawah (y PDF menghitung dari bawah), lalu kiri → kanan.
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.cells.sort((a, b) => a.x - b.x);
      const text = row.cells
        .map((c) => c.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      lines.push({ text, cells: row.cells, page: pageNo });
    }

    page.cleanup();
  }

  const pages = doc.numPages;
  await doc.destroy();
  return { lines, pages };
}

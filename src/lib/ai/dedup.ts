/**
 * Kunci normalisasi keterangan transaksi.
 *
 * Dipakai untuk dua hal:
 * 1. Deduplikasi sebelum panggil AI — belanja 40x di Indomaret cuma dikirim
 *    sekali ke API, hasilnya dipakai ulang.
 * 2. Menyimpan koreksi kategori manual — sekali kamu perbaiki satu transaksi,
 *    semua transaksi dengan pola keterangan yang sama ikut terkoreksi.
 *
 * Modul ini sengaja dipisah dari `enrich.ts` supaya bisa diimpor dari komponen
 * client tanpa menarik SDK Anthropic ke bundle browser.
 */
export function dedupKey(description: string): string {
  return description
    .toUpperCase()
    // Angka 4 digit ke atas hampir selalu nomor referensi/terminal, bukan
    // bagian identitas merchant.
    .replace(/\d{4,}/g, "#")
    .replace(/[^A-Z0-9#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

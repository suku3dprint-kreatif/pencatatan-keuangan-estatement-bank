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
/**
 * Jumlah transaksi maksimal per panggilan `/api/enrich`.
 *
 * Angkanya ditentukan batas durasi function, bukan ukuran payload. Di dalam
 * `enrichTransactions` item dipecah per 30 dan dijalankan 3 paralel, jadi 90
 * item = paling banyak 3 batch = **satu putaran** panggilan API. Satu putaran
 * aman diselesaikan dalam 60 detik (batas plan Hobby Vercel); dua putaran
 * tidak. Deduplikasi jalan sebelum pembatchan, jadi biasanya jauh lebih sedikit.
 *
 * Dipakai bersama oleh route handler (sebagai batas yang ditolak) dan halaman
 * client (sebagai ukuran potongan) — kalau keduanya beda, setiap request
 * langsung ditolak 413.
 */
export const ENRICH_MAX_ITEMS = 90;

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

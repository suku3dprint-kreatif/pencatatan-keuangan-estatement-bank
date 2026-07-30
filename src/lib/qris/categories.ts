/**
 * Taksonomi kategori. Sengaja dibikin terbatas & stabil supaya AI dan mesin
 * rule-based bicara "bahasa" yang sama, dan supaya warna chart tidak bergeser
 * saat daftar transaksi berubah.
 */
export type CategoryGroup = "expense" | "income" | "neutral";

export interface Category {
  id: string;
  label: string;
  group: CategoryGroup;
  emoji: string;
  /** Penjelasan singkat — ikut dikirim ke AI sebagai definisi kategori. */
  hint: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "makan_minum",
    label: "Makan & Minum",
    group: "expense",
    emoji: "🍜",
    hint: "Restoran, warung, warteg, kafe, kopi, boba, bakery, jajan, food court, food delivery.",
  },
  {
    id: "groceries",
    label: "Belanja Harian",
    group: "expense",
    emoji: "🛒",
    hint: "Minimarket, supermarket, pasar, sayur/buah/daging, sembako, toko kelontong.",
  },
  {
    id: "transportasi",
    label: "Transportasi & BBM",
    group: "expense",
    emoji: "🛵",
    hint: "Ojek/taksi online, bensin, SPBU, parkir, tol, tiket KRL/MRT/bus, bengkel, servis kendaraan.",
  },
  {
    id: "belanja_online",
    label: "Belanja Online",
    group: "expense",
    emoji: "📦",
    hint: "Marketplace dan e-commerce: Tokopedia, Shopee, Lazada, Blibli, TikTok Shop, Bukalapak.",
  },
  {
    id: "tagihan",
    label: "Tagihan & Utilitas",
    group: "expense",
    emoji: "💡",
    hint: "Listrik PLN, air PDAM, internet/WiFi, pulsa & paket data, BPJS, asuransi, iuran, sewa.",
  },
  {
    id: "hiburan",
    label: "Hiburan & Langganan",
    group: "expense",
    emoji: "🎬",
    hint: "Netflix, Spotify, YouTube Premium, game, bioskop, konser, wisata, hobi, olahraga.",
  },
  {
    id: "kesehatan",
    label: "Kesehatan",
    group: "expense",
    emoji: "💊",
    hint: "Apotek, klinik, rumah sakit, dokter, lab, vitamin, optik, perawatan medis.",
  },
  {
    id: "pendidikan",
    label: "Pendidikan",
    group: "expense",
    emoji: "📚",
    hint: "SPP sekolah/kampus, kursus, bimbel, buku pelajaran, seminar, sertifikasi.",
  },
  {
    id: "fashion_kecantikan",
    label: "Fashion & Kecantikan",
    group: "expense",
    emoji: "👕",
    hint: "Pakaian, sepatu, tas, skincare, kosmetik, salon, barbershop, spa, laundry.",
  },
  {
    id: "rumah_tangga",
    label: "Rumah Tangga",
    group: "expense",
    emoji: "🏠",
    hint: "Perabot, elektronik rumah, perkakas, bahan bangunan, dekorasi, alat kebersihan.",
  },
  {
    id: "donasi_zakat",
    label: "Donasi & Zakat",
    group: "expense",
    emoji: "🤲",
    hint: "Zakat, infaq, sedekah, qurban, donasi lembaga sosial, sumbangan masjid.",
  },
  {
    id: "biaya_admin",
    label: "Biaya Admin & Pajak",
    group: "expense",
    emoji: "🧾",
    hint: "Biaya admin bank, biaya transfer, biaya kartu, denda, pajak, materai.",
  },
  {
    id: "investasi",
    label: "Investasi & Tabungan",
    group: "neutral",
    emoji: "📈",
    hint: "Reksadana, saham, emas, deposito, obligasi/SBN, kripto, setor tabungan berjangka.",
  },
  {
    id: "topup_ewallet",
    label: "Top Up E-Wallet",
    group: "neutral",
    emoji: "📲",
    hint: "Top up GoPay, OVO, DANA, ShopeePay, LinkAja, saldo e-money, e-toll.",
  },
  {
    id: "transfer_keluar",
    label: "Transfer Keluar",
    group: "neutral",
    emoji: "↗️",
    hint: "Kirim uang ke rekening lain atau ke orang lain, yang bukan pembayaran merchant.",
  },
  {
    id: "transfer_masuk",
    label: "Transfer Masuk",
    group: "income",
    emoji: "↙️",
    hint: "Terima uang dari rekening/orang lain yang bukan gaji.",
  },
  {
    id: "tarik_tunai",
    label: "Tarik Tunai",
    group: "neutral",
    emoji: "🏧",
    hint: "Penarikan tunai di ATM atau setor/tarik di teller & agen.",
  },
  {
    id: "pendapatan",
    label: "Pendapatan & Gaji",
    group: "income",
    emoji: "💰",
    hint: "Gaji, payroll, THR, bonus, honor, komisi, hasil jualan, refund/cashback, bagi hasil, bunga.",
  },
  {
    id: "lainnya",
    label: "Lainnya",
    group: "expense",
    emoji: "❓",
    hint: "Dipakai hanya kalau benar-benar tidak ada petunjuk sama sekali.",
  },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category {
  return BY_ID.get(id) ?? BY_ID.get("lainnya")!;
}

export function isCategoryId(id: string): boolean {
  return BY_ID.has(id);
}

/** Baris definisi kategori yang dikirim ke AI (bagian prompt yang di-cache). */
export function categoryPromptBlock(): string {
  return CATEGORIES.map((c) => `- ${c.id}: ${c.label} — ${c.hint}`).join("\n");
}

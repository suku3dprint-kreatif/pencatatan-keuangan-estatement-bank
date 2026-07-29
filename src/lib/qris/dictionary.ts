/**
 * Kamus merchant Indonesia. Ini lapisan pertama sebelum AI: kalau nama merchant
 * sudah kebaca jelas di keterangan (kasus paling umum untuk QRIS bank digital),
 * tidak perlu panggil API sama sekali.
 *
 * `match` dicocokkan ke deskripsi yang sudah dinormalisasi (huruf besar,
 * tanpa tanda baca ganda). Urutan penting: entri paling spesifik ditaruh dulu.
 */
export interface MerchantEntry {
  /** Kata kunci yang harus muncul (case-insensitive, sudah dinormalisasi). */
  match: string[];
  merchant: string;
  category: string;
}

export const MERCHANTS: MerchantEntry[] = [
  // ── Minimarket & groceries ────────────────────────────────────────────────
  { match: ["INDOMARET", "INDOMRT"], merchant: "Indomaret", category: "groceries" },
  { match: ["ALFAMIDI"], merchant: "Alfamidi", category: "groceries" },
  { match: ["ALFAMART", "ALFAMRT"], merchant: "Alfamart", category: "groceries" },
  { match: ["ALFA EXPRESS", "LAWSON"], merchant: "Lawson", category: "groceries" },
  { match: ["SUPERINDO"], merchant: "Superindo", category: "groceries" },
  { match: ["HYPERMART"], merchant: "Hypermart", category: "groceries" },
  { match: ["TRANSMART", "CARREFOUR"], merchant: "Transmart", category: "groceries" },
  { match: ["GIANT EKSTRA", "GIANT EXPRESS"], merchant: "Giant", category: "groceries" },
  { match: ["RANCH MARKET", "FARMERS MARKET"], merchant: "Ranch Market", category: "groceries" },
  { match: ["TIP TOP", "TIPTOP"], merchant: "Tip Top", category: "groceries" },
  { match: ["YOGYA", "TOSERBA"], merchant: "Toserba Yogya", category: "groceries" },
  { match: ["SAYURBOX", "TANIHUB", "SEGARI"], merchant: "Sayur Online", category: "groceries" },
  { match: ["ACE HARDWARE"], merchant: "Ace Hardware", category: "rumah_tangga" },
  { match: ["INFORMA", "IKEA", "DEKORUMA"], merchant: "Furnitur", category: "rumah_tangga" },
  { match: ["MITRA10", "DEPO BANGUNAN", "SEMEN"], merchant: "Material Bangunan", category: "rumah_tangga" },

  // ── Kopi, boba, bakery ────────────────────────────────────────────────────
  { match: ["KOPI KENANGAN"], merchant: "Kopi Kenangan", category: "makan_minum" },
  { match: ["JANJI JIWA", "JIWA TOAST"], merchant: "Janji Jiwa", category: "makan_minum" },
  { match: ["TOMORO"], merchant: "Tomoro Coffee", category: "makan_minum" },
  { match: ["FORE COFFEE", "FORE"], merchant: "Fore Coffee", category: "makan_minum" },
  { match: ["STARBUCKS", "SBUX"], merchant: "Starbucks", category: "makan_minum" },
  { match: ["POINT COFFEE"], merchant: "Point Coffee", category: "makan_minum" },
  { match: ["KOPI SOE", "KOPI LAIN HATI", "KOPI NAKO"], merchant: "Kedai Kopi", category: "makan_minum" },
  { match: ["EXCELSO", "NGOPI DOELOE", "ANOMALI"], merchant: "Kedai Kopi", category: "makan_minum" },
  { match: ["MIXUE"], merchant: "Mixue", category: "makan_minum" },
  { match: ["CHATIME", "XING FU TANG", "HAUS", "MOMOYO"], merchant: "Minuman Boba", category: "makan_minum" },
  { match: ["ES TEH INDONESIA", "ESTEH"], merchant: "Es Teh Indonesia", category: "makan_minum" },
  { match: ["ROTI O", "ROTIO", "BREADTALK", "HOLLAND BAKERY"], merchant: "Bakery", category: "makan_minum" },
  { match: ["JCO", "J CO", "DUNKIN", "KRISPY KREME"], merchant: "Donat", category: "makan_minum" },

  // ── Restoran & fast food ──────────────────────────────────────────────────
  { match: ["MCDONALD", "MCD"], merchant: "McDonald's", category: "makan_minum" },
  { match: ["KFC"], merchant: "KFC", category: "makan_minum" },
  { match: ["BURGER KING"], merchant: "Burger King", category: "makan_minum" },
  { match: ["PIZZA HUT", "DOMINO"], merchant: "Pizza", category: "makan_minum" },
  { match: ["RICHEESE", "RICHESSE"], merchant: "Richeese Factory", category: "makan_minum" },
  { match: ["HOKBEN", "HOKA HOKA"], merchant: "HokBen", category: "makan_minum" },
  { match: ["YOSHINOYA", "SUSHI TEI", "SUSHI HIRO", "GYUKAKU"], merchant: "Resto Jepang", category: "makan_minum" },
  { match: ["SOLARIA", "BAKMI GM", "IMPERIAL KITCHEN"], merchant: "Resto Keluarga", category: "makan_minum" },
  { match: ["GEPREK", "SABANA", "SASA AYAM", "AYAM"], merchant: "Ayam Goreng", category: "makan_minum" },
  { match: ["MIE GACOAN", "GACOAN"], merchant: "Mie Gacoan", category: "makan_minum" },
  { match: ["PADANG", "SEDERHANA"], merchant: "RM Padang", category: "makan_minum" },
  { match: ["WARTEG", "WARUNG", "WARUNK", "KANTIN", "KEDAI"], merchant: "Warung Makan", category: "makan_minum" },
  { match: ["BAKSO", "MIE AYAM", "SOTO", "SATE", "NASI GORENG", "SEBLAK", "SEBLAK"], merchant: "Makanan Lokal", category: "makan_minum" },
  { match: ["MARTABAK", "TERANG BULAN", "PISANG", "GORENGAN"], merchant: "Jajanan", category: "makan_minum" },

  // ── Food delivery & marketplace ───────────────────────────────────────────
  { match: ["GOFOOD", "GO FOOD"], merchant: "GoFood", category: "makan_minum" },
  { match: ["GRABFOOD", "GRAB FOOD"], merchant: "GrabFood", category: "makan_minum" },
  { match: ["SHOPEEFOOD", "SHOPEE FOOD"], merchant: "ShopeeFood", category: "makan_minum" },
  { match: ["TOKOPEDIA", "TOKPED"], merchant: "Tokopedia", category: "belanja_online" },
  { match: ["SHOPEE"], merchant: "Shopee", category: "belanja_online" },
  { match: ["LAZADA"], merchant: "Lazada", category: "belanja_online" },
  { match: ["BLIBLI"], merchant: "Blibli", category: "belanja_online" },
  { match: ["BUKALAPAK"], merchant: "Bukalapak", category: "belanja_online" },
  { match: ["TIKTOK SHOP", "TOKOPEDIA TIKTOK"], merchant: "TikTok Shop", category: "belanja_online" },
  { match: ["ZALORA", "UNIQLO", "H M ", "ERIGO", "MATAHARI"], merchant: "Fashion Retail", category: "fashion_kecantikan" },

  // ── Transportasi ──────────────────────────────────────────────────────────
  { match: ["GOJEK", "GORIDE", "GOCAR", "GO RIDE", "GO CAR"], merchant: "Gojek", category: "transportasi" },
  { match: ["GRAB"], merchant: "Grab", category: "transportasi" },
  { match: ["MAXIM", "INDRIVE", "BLUEBIRD", "BLUE BIRD"], merchant: "Taksi Online", category: "transportasi" },
  { match: ["PERTAMINA", "SPBU", "PERTAMAX", "SHELL", "VIVO ", "BP AKR"], merchant: "SPBU", category: "transportasi" },
  { match: ["JASA MARGA", "TOL", "E TOLL", "ETOLL"], merchant: "Tol", category: "transportasi" },
  { match: ["KAI", "KERETA", "KRL", "MRT", "TRANSJAKARTA", "COMMUTER"], merchant: "Transportasi Publik", category: "transportasi" },
  { match: ["PARKIR", "PARKING", "SECURE PARKING", "ISS PARK"], merchant: "Parkir", category: "transportasi" },
  { match: ["BENGKEL", "PLANET BAN", "AUTO2000", "SERVIS MOTOR"], merchant: "Bengkel", category: "transportasi" },
  { match: ["GARUDA", "LION AIR", "CITILINK", "AIRASIA", "BATIK AIR"], merchant: "Tiket Pesawat", category: "transportasi" },
  { match: ["TRAVELOKA", "TIKET COM", "TIKETCOM", "PEGIPEGI", "AGODA", "BOOKING COM"], merchant: "Travel Booking", category: "hiburan" },

  // ── Tagihan & utilitas ────────────────────────────────────────────────────
  { match: ["PLN", "LISTRIK", "TOKEN LISTRIK"], merchant: "PLN", category: "tagihan" },
  { match: ["PDAM", "AIR MINUM", "PALYJA", "AETRA"], merchant: "PDAM", category: "tagihan" },
  { match: ["TELKOMSEL", "TSEL", "BY U", "BYU"], merchant: "Telkomsel", category: "tagihan" },
  { match: ["INDIHOME", "TELKOM INDONESIA"], merchant: "IndiHome", category: "tagihan" },
  { match: ["XL AXIATA", "AXIS"], merchant: "XL Axiata", category: "tagihan" },
  { match: ["INDOSAT", "IM3", "TRI ", "3 INDONESIA", "SMARTFREN"], merchant: "Operator Seluler", category: "tagihan" },
  { match: ["FIRST MEDIA", "BIZNET", "MYREPUBLIC", "ICONNET", "MNC PLAY"], merchant: "Internet Provider", category: "tagihan" },
  { match: ["BPJS"], merchant: "BPJS", category: "tagihan" },
  { match: ["PRUDENTIAL", "ALLIANZ", "AXA", "MANULIFE", "ASURANSI"], merchant: "Asuransi", category: "tagihan" },
  { match: ["PULSA", "PAKET DATA", "VOUCHER DATA"], merchant: "Pulsa & Data", category: "tagihan" },

  // ── Hiburan & langganan digital ───────────────────────────────────────────
  { match: ["NETFLIX"], merchant: "Netflix", category: "hiburan" },
  { match: ["SPOTIFY"], merchant: "Spotify", category: "hiburan" },
  { match: ["YOUTUBE", "GOOGLE YOUTUBE"], merchant: "YouTube Premium", category: "hiburan" },
  { match: ["DISNEY", "HOTSTAR", "VIDIO", "VIU", "WETV", "IQIYI", "PRIME VIDEO"], merchant: "Streaming Video", category: "hiburan" },
  { match: ["APPLE", "ITUNES", "APP STORE"], merchant: "Apple", category: "hiburan" },
  { match: ["GOOGLE PLAY", "GOOGLE ", "PLAY STORE"], merchant: "Google Play", category: "hiburan" },
  { match: ["STEAM", "GARENA", "CODASHOP", "UNIPIN", "MOBILE LEGENDS", "PUBG", "ROBLOX"], merchant: "Game", category: "hiburan" },
  { match: ["CGV", "XXI", "CINEPOLIS", "CINEMA"], merchant: "Bioskop", category: "hiburan" },
  { match: ["GYM", "FITNESS", "CELEBRITY FIT", "GOLD S GYM"], merchant: "Gym", category: "hiburan" },
  { match: ["CHATGPT", "OPENAI", "ANTHROPIC", "CLAUDE", "MIDJOURNEY", "NOTION", "CANVA", "FIGMA", "ADOBE", "GITHUB"], merchant: "Langganan Software", category: "hiburan" },

  // ── Kesehatan ─────────────────────────────────────────────────────────────
  { match: ["KIMIA FARMA", "K 24", "K24", "APOTEK", "GUARDIAN", "WATSONS", "CENTURY"], merchant: "Apotek", category: "kesehatan" },
  { match: ["RS ", "RUMAH SAKIT", "SILOAM", "MITRA KELUARGA", "HERMINA", "KLINIK", "PUSKESMAS"], merchant: "Fasilitas Kesehatan", category: "kesehatan" },
  { match: ["HALODOC", "ALODOKTER", "PRODIA", "LAB KLINIK"], merchant: "Layanan Kesehatan", category: "kesehatan" },
  { match: ["OPTIK"], merchant: "Optik", category: "kesehatan" },

  // ── Pendidikan ────────────────────────────────────────────────────────────
  { match: ["SPP", "UANG SEKOLAH", "UNIVERSITAS", "SEKOLAH", "KAMPUS", "YAYASAN PENDIDIKAN"], merchant: "Biaya Pendidikan", category: "pendidikan" },
  { match: ["RUANGGURU", "ZENIUS", "BIMBEL", "UDEMY", "COURSERA", "SKILL ACADEMY"], merchant: "Kursus Online", category: "pendidikan" },
  { match: ["GRAMEDIA", "TOKO BUKU"], merchant: "Gramedia", category: "pendidikan" },

  // ── Fashion & kecantikan ──────────────────────────────────────────────────
  { match: ["SOCIOLLA", "SEPHORA", "THE BODY SHOP", "SKINTIFIC", "SOMETHINC"], merchant: "Skincare & Kosmetik", category: "fashion_kecantikan" },
  { match: ["BARBERSHOP", "SALON", "PANGKAS", "NAIL ART", "SPA "], merchant: "Salon & Barbershop", category: "fashion_kecantikan" },
  { match: ["LAUNDRY", "LONDRI"], merchant: "Laundry", category: "fashion_kecantikan" },
  { match: ["ERAFONE", "IBOX", "SAMSUNG", "OPPO", "XIAOMI", "DIGIMAP"], merchant: "Gadget & Elektronik", category: "rumah_tangga" },

  // ── Donasi & zakat ────────────────────────────────────────────────────────
  { match: ["ZAKAT", "INFAQ", "INFAK", "SEDEKAH", "SHADAQAH", "QURBAN", "WAKAF"], merchant: "Zakat & Sedekah", category: "donasi_zakat" },
  { match: ["BAZNAS", "DOMPET DHUAFA", "RUMAH ZAKAT", "ACT ", "KITABISA", "LAZISMU", "NU CARE"], merchant: "Lembaga Zakat", category: "donasi_zakat" },
  { match: ["MASJID", "MUSHOLLA", "PANTI ASUHAN", "DONASI"], merchant: "Donasi", category: "donasi_zakat" },

  // ── Investasi ─────────────────────────────────────────────────────────────
  { match: ["BIBIT", "BAREKSA", "AJAIB", "STOCKBIT", "IPOT", "MOST ", "MIRAE"], merchant: "Platform Investasi", category: "investasi" },
  { match: ["PLUANG", "PEGADAIAN", "TABUNGAN EMAS", "ANTAM", "TREASURY"], merchant: "Emas & Gadai", category: "investasi" },
  { match: ["SBN", "ORI ", "SUKUK", "OBLIGASI", "DEPOSITO", "REKSADANA", "REKSA DANA"], merchant: "Investasi", category: "investasi" },
  { match: ["INDODAX", "TOKOCRYPTO", "PINTU", "BINANCE", "REKU"], merchant: "Kripto", category: "investasi" },

  // ── E-wallet / top up ─────────────────────────────────────────────────────
  { match: ["GOPAY"], merchant: "GoPay", category: "topup_ewallet" },
  { match: ["OVO"], merchant: "OVO", category: "topup_ewallet" },
  { match: ["DANA"], merchant: "DANA", category: "topup_ewallet" },
  { match: ["SHOPEEPAY", "SHOPEE PAY"], merchant: "ShopeePay", category: "topup_ewallet" },
  { match: ["LINKAJA", "LINK AJA"], merchant: "LinkAja", category: "topup_ewallet" },
  { match: ["FLAZZ", "E MONEY", "EMONEY", "BRIZZI", "TAPCASH"], merchant: "Uang Elektronik", category: "topup_ewallet" },
];

/**
 * Kata kunci generik: dipakai kalau tak ada merchant spesifik yang cocok.
 * Hanya menentukan kategori, bukan nama merchant.
 */
export const CATEGORY_KEYWORDS: { match: string[]; category: string }[] = [
  { match: ["RESTO", "RESTAURANT", "FOOD", "CAFE", "COFFEE", "EATERY", "DIMSUM", "SEAFOOD", "STEAK", "NOODLE", "CHICKEN", "BAKMI", "MIE ", "NASI", "ROTI", "SNACK", "JUS ", "JUICE", "MINUMAN", "DAPUR", "CATERING", "BAKERY", "DESSERT", "ICE CREAM"], category: "makan_minum" },
  { match: ["TOKO", "SHOP", "STORE", "MART", "GROSIR", "SEMBAKO", "PASAR", "AGEN "], category: "groceries" },
  { match: ["BENSIN", "OLI ", "TAMBAL", "CUCI MOBIL", "CUCI MOTOR", "TRAVEL", "SHUTTLE", "RENTAL"], category: "transportasi" },
  { match: ["APOTIK", "DOKTER", "MEDIS", "HEALTH", "DENTAL", "GIGI"], category: "kesehatan" },
  { match: ["ADMIN", "BIAYA", "FEE", "CHARGE", "MATERAI", "PENALTY", "DENDA", "PAJAK", "TAX"], category: "biaya_admin" },
  { match: ["SEWA", "KOST", "KONTRAKAN", "IURAN", "TAGIHAN", "BILL"], category: "tagihan" },
  { match: ["GAJI", "PAYROLL", "SALARY", "THR", "BONUS", "HONOR", "KOMISI", "INSENTIF", "REFUND", "CASHBACK", "BAGI HASIL", "BUNGA", "DIVIDEN"], category: "pendapatan" },
];

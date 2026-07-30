# Analisa E-Statement Bank

Upload e-statement bank berupa **PDF atau CSV** — satu file atau beberapa bulan sekaligus — dan
tools ini akan:

1. **Membaca transaksinya** — tahu layout kolom debit/kredit per bank, dan mengoreksi arah dana dari selisih saldo berjalan.
2. **Menggabungkan beberapa file** jadi satu analisa, dengan deteksi periode tumpang tindih dan pembuangan transaksi ganda.
3. **Menebak merchant di balik kode QRIS** — keterangan seperti `QRIS 1234567890123 ID1020012345678 WRG MKN BU SRI` diterjemahkan jadi `Warung Makan Bu Sri`, kategori **Makan & Minum**.
4. **Menampilkan visualisasi** — arus kas bulanan, pengeluaran per kategori, top merchant, saldo harian, pola per hari.
5. **Menganalisa lebih dalam** — pembayaran berulang/langganan, transaksi anomali, laju pengeluaran, tingkat menabung.

Bank yang layout-nya sudah dikenali: **BSI, Mandiri/Livin', BRI/BRImo, BNI, BCA, Jago, SeaBank, blu, Neo Commerce** — plus mesin *generic* untuk format lain. Ekspor CSV BRImo sudah diuji dengan file asli.

---

## Cara menjalankan

```bash
npm install
cp .env.example .env.local     # lalu isi ANTHROPIC_API_KEY
npm run dev                    # buka http://localhost:3000
```

Tanpa `ANTHROPIC_API_KEY` aplikasi **tetap jalan** — hanya saja transaksi QRIS yang namanya tidak
ada di kamus merchant akan berlabel "Belum jelas" dan bisa kamu koreksi manual.

| Variabel | Wajib | Default | Keterangan |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | tidak | — | Kalau kosong, AI analyzer dilewati |
| `ANTHROPIC_MODEL` | tidak | `claude-opus-5` | |
| `ANTHROPIC_EFFORT` | tidak | `medium` | `low` \| `medium` \| `high` \| `xhigh` \| `max` |

---

## Cara kerja penebakan merchant

Ada tiga lapisan, dijalankan berurutan dari yang paling murah:

| Lapisan | Menangani | Biaya |
|---|---|---|
| **Kamus merchant** (~150 entri) | Indomaret, Alfamart, Mixue, Kopi Kenangan, Pertamina, PLN, Netflix, … | gratis |
| **Aturan rule-based** | transfer, tarik tunai, biaya admin, gaji, bagi hasil, top up, tagihan | gratis |
| **AI (Claude)** | sisanya — merchant lokal, singkatan, warung, toko yang namanya terpotong | per token |

Hemat token dengan tiga cara:

- **Deduplikasi.** Belanja 40x di Indomaret dikirim ke API **satu kali**; hasilnya dipakai ulang.
  Kuncinya menormalkan nomor referensi (`\d{4,}` → `#`), jadi transaksi merchant sama yang beda
  nomor referensi dianggap identik.
- **Prompt caching.** Definisi kategori + konteks QRIS (bagian prompt yang tidak pernah berubah)
  ditandai `cache_control`, sehingga batch kedua dan seterusnya membacanya dari cache.
- **Batching.** 30 transaksi per panggilan, maksimal 3 panggilan paralel.

Output AI dibatasi lewat **structured output** (`output_config.format` dengan JSON Schema), dan
`category` dibatasi `enum` ke daftar kategori yang ada — jadi model tidak bisa mengarang kategori
baru. Hasil di luar skema tetap divalidasi ulang di sisi server sebelum dipakai.

---

## Yang bikin parser-nya tidak gampang salah

Tiga masalah nyata yang ditangani khusus:

**1. Kolom debit/kredit terpisah tanpa penanda.**
Statement Mandiri/BRI/BNI menaruh nominal keluar dan masuk di dua kolom berbeda tanpa tanda `DB`/`CR`.
Satu-satunya pembeda adalah posisi horizontalnya. Karena itu parser mengekstrak PDF **beserta
koordinat x** setiap potongan teks, lalu memetakan nominal ke kolom terdekat dari baris header.

**2. Selisih saldo sebagai jaring pengaman.**
Kalau kolom saldo terbaca, arah dana diverifikasi dari `saldo[i] - saldo[i-1]`. Ini memperbaiki
tebakan yang salah tanpa perlu tahu layout bank mana pun, dan menaikkan keyakinan ke 100%.

**3. Koma desimal Indonesia mengecoh deteksi delimiter CSV.**
Nominal `22.000,00` membuat heuristik bawaan papaparse menyimpulkan delimiter-nya koma, sehingga
setiap nominal terbelah dua. Karena itu delimiter dideteksi sendiri, dengan `;` dan tab
diprioritaskan di atas `,`.

**4. Nama kolom bank tidak seragam, dan ada dua kolom saldo.**
Ekspor BRImo memakai `TGL_TRAN`, `DESK_TRAN`, `MUTASI_DEBET`. Pencocokan nama kolom karena itu
dilakukan per kata, bukan per substring — kalau tidak, `TGL_TRAN` tidak terbaca sebagai tanggal dan
seluruh file gagal diparse. Ekspor itu juga punya `SALDO_AWAL_MUTASI` **dan**
`SALDO_AKHIR_MUTASI`; yang "awal" sengaja ditolak, karena kalau terambil, grafik saldo dan
rekonsiliasi arah dana bergeser satu baris.

**5. Lokasi ATM bukan nama merchant.**
Keterangan penarikan tunai BRImo memuat lokasi ATM-nya, mis. `Penarikan tunai di ATM - RS CONTOH
SEJAHTERA`. Kamus mencocokkan `RS ` ke fasilitas kesehatan, sehingga tarik tunai terhitung sebagai
belanja kesehatan. Karena itu jenis transaksi yang strukturnya sudah pasti — tarik tunai, biaya,
gaji, transfer, top up — selalu mengalahkan kamus merchant dalam menentukan kategori.

Selain itu: tanggal tanpa tahun (`05/01` gaya BCA) dilengkapi dari periode di header statement,
baris keterangan yang terpotong ke baris berikutnya digabung kembali, nomor referensi panjang
maupun tahun polos (`2026`) tidak ikut terbaca sebagai nominal, dan nama penerima transfer diambil
dari bagian setelah nama bank (`… ke BANK X - 123 - Sari Wulandari` → `Sari Wulandari`, bukan
`Syariah Mandiri`).

### Kalau statement memang tidak mencantumkan nama merchant

Sebagian bank mengekspor transaksi QRIS hanya sebagai kode transaksi dan merchant PAN, tanpa nama
merchant sama sekali — contohnya `QRISRNS119003178520#9360000210027337763`. Transaksi seperti ini:

- ditandai `QRIS tanpa nama merchant` dan **tidak dikirim ke AI** — tidak ada informasi untuk
  dianalisa, jadi mengirimnya hanya membuang token dan memancing nama merchant karangan;
- tidak dihitung sebagai "teridentifikasi", supaya persentasenya jujur;
- dilaporkan sebagai temuan tersendiri, lengkap dengan nilai totalnya.

Untuk melacaknya, cocokkan tanggal dan nominalnya dengan riwayat di aplikasi mobile banking.

---

## Struktur kode

```
src/
  app/
    page.tsx                  alur: upload → parse → enrich → dashboard
    api/parse/route.ts        PDF/CSV → transaksi + klasifikasi rule-based
    api/enrich/route.ts       transaksi belum jelas → klasifikasi AI
  lib/
    parse/
      primitives.ts           parser angka & tanggal (ID + EN)
      pdf.ts                  ekstraksi teks PDF beserta koordinat x
      csv.ts                  deteksi delimiter + pemetaan nama kolom
      engine.ts               mesin parser berbasis baris + rekonsiliasi saldo
      banks.ts                profil & deteksi bank
    qris/
      detect.ts               deteksi QRIS, ekstraksi NMID/TID/acquirer
      dictionary.ts           kamus merchant Indonesia
      rules.ts                klasifikasi tanpa AI
      categories.ts           taksonomi kategori (juga jadi prompt untuk AI)
    ai/
      enrich.ts               batching, caching, structured output
      dedup.ts                kunci normalisasi keterangan
    analysis/
      metrics.ts              agregasi, deteksi langganan & anomali
      insights.ts             temuan berbahasa manusia
  components/                 dashboard, chart, tabel
```

---

## Testing

```bash
npm test              # 46 test: unit + integration
npm run lint
npm run typecheck
npm run build
npm run fixtures      # buat e-statement sintetis di tests/fixtures/ (opsional; `npm test` sudah otomatis)
```

- **Unit test** (`tests/parse.test.mjs`) — parser angka & tanggal, deteksi delimiter, deteksi bank,
  rekonsiliasi saldo, deteksi QRIS, klasifikasi rule-based, kunci deduplikasi.
- **Integration test** (`tests/statement.test.mjs`) — menjalankan `parseStatement` terhadap fixture
  sintetis dan memeriksa hasil akhirnya: jumlah transaksi, arah dana, nominal, saldo, kategori.
  Empat jalur parser diuji: PDF dua kolom debet/kredit (BSI), PDF satu kolom dengan penanda `DB` dan
  tanggal tanpa tahun (BCA), CSV `;` dengan baris basa-basi sebelum header (Mandiri), dan CSV tanpa
  header yang harus jatuh ke mesin parser baris. Termasuk satu kasus file sampah, untuk memastikan
  parser memberi peringatan alih-alih error.
- **Test format BRImo + multi-file** (`tests/brimo.test.mjs`) — fixture yang meniru struktur asli
  ekspor BRImo (19 kolom, dua kolom saldo, `DESK_TRAN` vs `REMARK_CUSTOM`). Yang dijaga di sini:
  pemetaan nama kolom teknis, penolakan kolom saldo awal, rekonsiliasi saldo, QRIS tanpa nama
  merchant, lokasi ATM yang tidak boleh jadi merchant, dan penggabungan multi-file — termasuk
  bahwa baris kembar di dalam satu file tetap dipertahankan sementara duplikat lintas file dibuang.

Fixture dibuat otomatis oleh test-nya, jadi tidak ada file yang perlu di-commit. Nomor rekening,
nama, dan nominal di semua fixture adalah karangan.

### CI

`.github/workflows/ci.yml` menjalankan `lint → typecheck → test → build` di Node 22 pada setiap
pull request, plus job terpisah untuk `npm audit` dependensi produksi (severity high ke atas).
Audit dipisah karena bisa memerah gara-gara advisory baru yang terbit di hulu, bukan karena
perubahan di PR-nya.

Build di CI **sengaja dijalankan tanpa `ANTHROPIC_API_KEY`** — itu memverifikasi bahwa aplikasi
memang tetap bisa dipakai tanpa AI.

### Catatan `overrides` di package.json

Tiga paket transitif dipaksa ke versi yang sudah menutup CVE, karena versi yang dibawa induknya
masih rentan: `sharp` (CVE libvips; sebenarnya tidak terpakai karena app ini tidak memakai
`next/image`), `postcss`, dan `brace-expansion` (rantai dependensi ESLint). Tanpa override ini
`npm audit` melaporkan kerentanan high. Override bisa dihapus begitu paket induknya naik sendiri.

### Menguji jalur AI tanpa API key

```bash
node tests/mock-anthropic.mjs                                    # terminal 1
ANTHROPIC_API_KEY=mock ANTHROPIC_BASE_URL=http://localhost:3222 \
  npm run dev                                                    # terminal 2
```

Mock membalas SSE dengan bentuk yang sama seperti API sungguhan, dan mencetak parameter request
yang diterimanya — berguna untuk memastikan model, effort, caching, dan skema terkirim benar.

### Screenshot dashboard

```bash
npm i -D playwright && npm run screenshot statement-bsi.pdf
npm run screenshot brimo-apr.csv brimo-may.csv   # menguji tampilan multi-file
```

Menyimpan tangkapan mode terang & gelap ke `tests/screenshots/`, sekaligus memeriksa tidak ada
overflow horizontal maupun label sumbu yang terbungkus. Argumen boleh nama fixture atau path
absolut, dan boleh lebih dari satu file.

---

## Catatan privasi

- File **tidak disimpan ke disk**; diproses di memori lalu dibuang.
- Kalau AI analyzer aktif, yang dikirim ke Anthropic API hanya **keterangan transaksi, nominal, dan
  tanggal**. Nomor rekening, nama pemilik, dan saldo tidak ikut dikirim.
- Koreksi kategori manual disimpan di `localStorage` browser kamu, bukan di server.
- `.gitignore` sudah memblokir `*.pdf` dan `/statements/` supaya e-statement asli tidak
  ikut ter-commit.

---

## Batasan yang perlu diketahui

- **PDF hasil scan tidak bisa dibaca.** Parser mengambil teks, bukan gambar. Kalau statement-mu hasil
  scan/foto, jalankan OCR dulu atau ekspor CSV dari mobile banking.
- **PDF berpassword belum didukung.** Buka proteksinya dulu.
- **Layout bank bisa berubah.** Parser dibuat toleran (tanggal di kolom kiri + nominal di kanan +
  rekonsiliasi saldo), tapi kalau ada bank yang layout-nya jauh berbeda, hasilnya perlu diperiksa —
  panel peringatan di atas dashboard akan memberi tahu berapa baris yang dilewati.
- **Tebakan AI tetap tebakan.** Setiap transaksi menampilkan sumber dan tingkat keyakinannya; yang
  di bawah 60% sebaiknya kamu periksa. Kategori bisa dikoreksi manual dan koreksinya berlaku untuk
  semua transaksi dengan pola keterangan yang sama.
- **Kolom saldo tidak selalu ada.** Tanpa itu, grafik saldo harian dilewati dan koreksi arah dana
  otomatis tidak bisa dipakai.
- **Sudah diuji dengan e-statement asli untuk BRImo saja.** Ekspor CSV BRImo dua bulan diverifikasi
  dengan cara yang paling ketat: seluruh baris terbaca, dan saldo awal ditambah semua mutasi tepat
  sama dengan saldo akhir di statement. Bank lain masih diuji dengan fixture sintetis yang meniru
  layoutnya — silakan coba dengan file aslimu, dan panel peringatan di atas dashboard akan
  menunjukkan kalau ada baris yang terlewat.
- **Menggabungkan rekening berbeda dihitung apa adanya.** Kalau file dari beberapa bank atau
  beberapa rekening digabung, angkanya dijumlahkan dan sebuah peringatan ditampilkan — tapi tools
  ini tidak tahu apakah itu memang yang kamu maksud.

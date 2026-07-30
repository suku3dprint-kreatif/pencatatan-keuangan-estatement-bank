/**
 * Membuat fixture e-statement sintetis untuk menguji parser.
 *
 * PDF-nya ditulis manual (uncompressed, satu Tj per sel) supaya setiap potongan
 * teks punya koordinat x sendiri — persis seperti PDF statement asli, dan itulah
 * yang dipakai parser untuk membedakan kolom debet dan kredit.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "fixtures");
mkdirSync(outDir, { recursive: true });

/** Escape untuk string literal PDF. */
function pdfString(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** cells: { text, x, y }[] → satu halaman PDF berukuran Letter. */
function buildPdf(pages) {
  const objects = [];
  const pageIds = [];
  let nextId = 3; // 1 = catalog, 2 = pages

  const contentIds = [];
  for (const cells of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    contentIds.push({ pageId, contentId, cells });
  }
  const fontId = nextId++;

  objects[1] = `<</Type /Catalog /Pages 2 0 R>>`;
  objects[2] = `<</Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length}>>`;
  objects[fontId] = `<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>`;

  for (const { pageId, contentId, cells } of contentIds) {
    objects[pageId] =
      `<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources <</Font <</F1 ${fontId} 0 R>>>> /Contents ${contentId} 0 R>>`;

    const stream = cells
      .map(
        (c) =>
          `BT /F1 9 Tf 1 0 0 1 ${c.x.toFixed(2)} ${c.y.toFixed(2)} Tm (${pdfString(c.text)}) Tj ET`,
      )
      .join("\n");
    objects[contentId] = `<</Length ${Buffer.byteLength(stream, "latin1")}>>\nstream\n${stream}\nendstream`;
  }

  // Rakit file + tabel xref.
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i < objects.length; i++) {
    if (!objects[i]) continue;
    offsets[i] = Buffer.byteLength(pdf, "latin1");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  const size = objects.length;
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) {
    const off = offsets[i] ?? 0;
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<</Size ${size} /Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// ── Kolom, meniru layout statement bank dengan debet & kredit terpisah ────────
const COL = { date: 50, desc: 108, debit: 330, credit: 408, balance: 486 };

/** Transaksi: [tanggal, keterangan, debet, kredit, saldo] */
const ROWS = [
  ["01/02/2026", "SALDO AWAL", "", "", "5.000.000,00"],
  ["02/02/2026", "QRIS 1234567890123 ID1020012345678 WRG MKN BU SRI", "25.000,00", "", "4.975.000,00"],
  ["02/02/2026", "QRIS PAYMENT INDOMARET CIPETE 9988776655", "43.500,00", "", "4.931.500,00"],
  ["03/02/2026", "TRSF E-BANKING DB 0302/FTSCY/WS95051 BUDI SANTOSO", "500.000,00", "", "4.431.500,00"],
  ["04/02/2026", "QRIS 5566778899001 ID1020098765432 KOPI KENANGAN GADING", "22.000,00", "", "4.409.500,00"],
  ["05/02/2026", "BIAYA ADM", "5.000,00", "", "4.404.500,00"],
  ["06/02/2026", "GAJI PT SUMBER MAKMUR FEB 2026", "", "12.500.000,00", "16.904.500,00"],
  ["07/02/2026", "QRIS 7788990011223 ID1020055512345 AMDK TIRTA JAYA", "18.000,00", "", "16.886.500,00"],
  ["08/02/2026", "PEMBAYARAN TAGIHAN PLN 512345678901", "350.000,00", "", "16.536.500,00"],
  ["09/02/2026", "QRIS 3344556677889 GOPAY MERCHANT AYM GEPREK PAK NO", "31.000,00", "", "16.505.500,00"],
  ["10/02/2026", "TOP UP GOPAY 081234567890", "200.000,00", "", "16.305.500,00"],
  ["11/02/2026", "QRIS 9900112233445 ID1020077788899 APOTEK SEHAT SENTOSA", "87.500,00", "", "16.218.000,00"],
  ["12/02/2026", "TARIK TUNAI ATM 1234", "1.000.000,00", "", "15.218.000,00"],
  ["13/02/2026", "QRIS 1122334455667 NETFLIX COM", "186.000,00", "", "15.032.000,00"],
  ["14/02/2026", "QRIS 2233445566778 ID1020033344455 TK BANGUNAN MAJU", "1.250.000,00", "", "13.782.000,00"],
  ["15/02/2026", "BAGI HASIL TABUNGAN", "", "12.450,00", "13.794.450,00"],
];

const HEADER = [
  { text: "PT BANK SYARIAH INDONESIA TBK", x: 50, y: 745 },
  { text: "MUTASI REKENING - BSI MOBILE", x: 50, y: 730 },
  { text: "PERIODE : 01/02/2026 s/d 28/02/2026", x: 50, y: 715 },
  { text: "NAMA : NASABAH CONTOH", x: 50, y: 700 },
  { text: "TANGGAL", x: COL.date, y: 675 },
  { text: "KETERANGAN", x: COL.desc, y: 675 },
  { text: "DEBET", x: COL.debit, y: 675 },
  { text: "KREDIT", x: COL.credit, y: 675 },
  { text: "SALDO", x: COL.balance, y: 675 },
];

const cells = [...HEADER];
let y = 655;
for (const [date, desc, debit, credit, balance] of ROWS) {
  cells.push({ text: date, x: COL.date, y });
  cells.push({ text: desc, x: COL.desc, y });
  if (debit) cells.push({ text: debit, x: COL.debit, y });
  if (credit) cells.push({ text: credit, x: COL.credit, y });
  if (balance) cells.push({ text: balance, x: COL.balance, y });
  y -= 18;
}
cells.push({ text: "Halaman 1 dari 1", x: 50, y: y - 20 });

writeFileSync(join(outDir, "statement-bsi.pdf"), buildPdf([cells]));

// ── CSV: header didahului beberapa baris basa-basi, seperti ekspor bank asli ──
const csv = [
  "Rekening Koran Bank Mandiri",
  "Nama;NASABAH CONTOH",
  "Periode;01/03/2026 s/d 31/03/2026",
  "",
  "Tanggal;Keterangan;Debit;Kredit;Saldo",
  '01/03/2026;"QRIS DEBIT 4455667788990 ID1020011122233 MIXUE PONDOK INDAH";22.000,00;;3.478.000,00',
  '02/03/2026;"QRIS 5566778899112 SHOPEEPAY WRUNG NASI PADANG SEDERHANA";35.000,00;;3.443.000,00',
  '03/03/2026;"TRANSFER MASUK BIFAST DARI SITI AMINAH";;750.000,00;4.193.000,00',
  '04/03/2026;"QRIS 6677889900223 ID1020044455566 SPBU 34-12102";150.000,00;;4.043.000,00',
  '05/03/2026;"BIAYA TRANSFER BIFAST";2.500,00;;4.040.500,00',
  '06/03/2026;"QRIS 7788990011334 ID1020066677788 TOKO KELONTONG SUMBER REJEKI";64.000,00;;3.976.500,00',
  '07/03/2026;"PEMBAYARAN SPOTIFY PREMIUM";54.990,00;;3.921.510,00',
  '08/03/2026;"QRIS 8899001122445 GRABFOOD ORDER";48.500,00;;3.873.010,00',
].join("\n");

writeFileSync(join(outDir, "statement-mandiri.csv"), csv, "utf8");

// ── PDF gaya BCA: satu kolom mutasi + penanda "DB", tanggal tanpa tahun ──────
const BCOL = { date: 45, desc: 95, cbg: 300, mutasi: 360, marker: 440, balance: 480 };
const BROWS = [
  ["05/01", "QR 0501/WSID/12345678 ALFAMART SUDIRMAN", "0000", "37.500,00", "DB", "2.462.500,00"],
  ["06/01", "TRSF E-BANKING CR 0601/FTSCY/WS95031 DEWI LESTARI", "0000", "1.500.000,00", "", "3.962.500,00"],
  ["07/01", "QR 0701/WSID/22334455 STARBUCKS PLAZA", "0000", "62.000,00", "DB", "3.900.500,00"],
  ["08/01", "BIAYA ADM", "0000", "17.000,00", "DB", "3.883.500,00"],
  ["09/01", "DEBIT CARD 1234 TOKOPEDIA", "0000", "289.000,00", "DB", "3.594.500,00"],
];

const bcaCells = [
  { text: "PT BANK CENTRAL ASIA TBK", x: 45, y: 745 },
  { text: "REKENING TAHAPAN - KLIKBCA", x: 45, y: 731 },
  { text: "PERIODE : JANUARI 2026", x: 45, y: 717 },
  { text: "TANGGAL", x: BCOL.date, y: 690 },
  { text: "KETERANGAN", x: BCOL.desc, y: 690 },
  { text: "CBG", x: BCOL.cbg, y: 690 },
  { text: "MUTASI", x: BCOL.mutasi, y: 690 },
  { text: "SALDO", x: BCOL.balance, y: 690 },
];
let by = 670;
for (const [date, desc, cbg, mutasi, marker, balance] of BROWS) {
  bcaCells.push({ text: date, x: BCOL.date, y: by });
  bcaCells.push({ text: desc, x: BCOL.desc, y: by });
  bcaCells.push({ text: cbg, x: BCOL.cbg, y: by });
  bcaCells.push({ text: mutasi, x: BCOL.mutasi, y: by });
  if (marker) bcaCells.push({ text: marker, x: BCOL.marker, y: by });
  bcaCells.push({ text: balance, x: BCOL.balance, y: by });
  by -= 18;
}
writeFileSync(join(outDir, "statement-bca.pdf"), buildPdf([bcaCells]));

// ── CSV gaya ekspor BRImo ────────────────────────────────────────────────────
// Meniru struktur asli ekspor BRImo: 19 kolom, delimiter koma, semua field
// dikutip, nominal bergaya Inggris tanpa pemisah ribuan (".00"), kolom saldo
// AWAL dan AKHIR keduanya ada, dan DESK_TRAN (kode teknis) terpisah dari
// REMARK_CUSTOM (keterangan versi manusia).
//
// Nomor rekening, nama, dan nominal di sini semuanya karangan.
const BRIMO_HEADER = [
  "ID", "NOREK", "TGL_TRAN", "TGL_EFEKTIF", "JAM_TRAN", "SEQ", "DESK_TRAN",
  "SALDO_AWAL_MUTASI", "MUTASI_DEBET", "MUTASI_KREDIT", "SALDO_AKHIR_MUTASI",
  "GLSIGN", "TRUSER", "KODE_TRAN", "KODE_TRAN_TELLER", "TRREMK", "TLBDS1",
  "TLBDS2", "REMARK_CUSTOM",
];

const NOREK = "000000000000001";

/** rows: [tanggal jam, desk_tran, debet, kredit, remark] */
function brimoCsv(input, openingBalance) {
  const out = [BRIMO_HEADER.map((h) => `"${h}"`).join(",")];
  // Ekspor bank selalu urut waktu, dan saldo berjalannya bergantung pada urutan
  // itu. Fixture harus mengikuti supaya rekonsiliasi saldo bisa diuji.
  const rows = [...input].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  let balance = openingBalance;
  rows.forEach(([stamp, desk, debit, credit, remark], i) => {
    const before = balance;
    balance = balance - debit + credit;
    const cell = (v) => `"${v}"`;
    // Nominal nol ditulis ".00" — persis seperti ekspor aslinya.
    const money = (v) => (v === 0 ? ".00" : v.toFixed(2));
    out.push(
      [
        cell(i + 1), cell(NOREK), cell(stamp), cell(stamp),
        cell(stamp.slice(11).replace(/:/g, "")), cell(String(500000 + i)),
        cell(desk), cell(before.toFixed(2)), cell(money(debit)), cell(money(credit)),
        cell(balance.toFixed(2)), cell(credit > 0 ? "Cr" : "Db"), cell("8888001"),
        cell("2"), cell("8508"), cell(desk.split(" ")[0]), cell(""), cell(""),
        cell(remark),
      ].join(","),
    );
  });
  return out.join("\n") + "\n";
}

// Semua nomor rekening, virtual account, nomor pelanggan, nomor HP, dan nama di
// bawah ini karangan. Yang ditiru hanya BENTUK-nya, bukan datanya.
const BRIMO_APR = [
  // QRIS yang keterangannya HANYA kode: tidak ada nama merchant sama sekali.
  ["2026-04-01 19:01:04", "QRISRNS900000000001#9360000900000000001 ESB:NBMB:000R100P:900000000001", 923434, 0, "QRISRNS900000000001#9360000900000000001"],
  ["2026-04-02 12:41:39", "QRISRNS900000000002#9360000900000000001 ESB:NBMB:000R100P:900000000002", 230130, 0, "QRISRNS900000000002#9360000900000000001"],
  // QRIS dengan nama merchant di REMARK_CUSTOM.
  ["2026-04-03 10:11:20", "QRIS900000000003#9360000900000000002 ESB:NBMB:0007X00P:900000000003", 113000, 0, "Pembayaran QRIS FAMILYMART CONTOH RAYA"],
  ["2026-04-03 12:53:33", "QRIS900000000004#9360000900000000003 ESB:NBMB:0007X00P:900000000004", 43000, 0, "Pembayaran QRIS SPBU 00.000.00 CONTOH"],
  // Transfer keluar BI-Fast: nama penerima ada di remark, setelah nama bank.
  ["2026-04-09 21:14:45", "BFST9000000001 NBMB:BSMDIDJA ESB:NBMB:0008G00F:900000000005", 90000, 0, "Transfer BI-Fast ke BANK SYARIAH MANDIRI - 9000000001 - Sari Wulandari"],
  ["2026-04-09 21:14:45", "BFST9000000001 NBMB:BSMDIDJA ESB:NBMB:0008G00F:900000000005", 2500, 0, "Transfer BI-Fast ke BANK SYARIAH MANDIRI - 9000000001 - Sari Wulandari"],
  // Tarik tunai yang nama ATM-nya mengandung "RS" — tidak boleh jadi Kesehatan.
  ["2026-04-18 08:10:24", "081200000000 00009999 000999000001 ESB:ATM1:009GG00W:000999000001", 300000, 0, "Penarikan tunai di ATM - RS CONTOH SEJAHTERA via BRImo"],
  // Tagihan lewat virtual account.
  ["2026-04-05 12:48:23", "PLN-PRA 99900011122NBMB9000000000000001 ESB:NBMB:20006PLN:900000000006", 100000, 0, "Pembelian Token PLN 99900011122 via BRImo"],
  ["2026-04-16 17:32:52", "BRIVA90000000000001NBMBTRAVELOKA ESB:NBMB:000CD00P:900000000007", 150059, 0, "Pembayaran BRIVA ke TRAVELOKA INDONESIA - 90000000000001 - TRAVELOKA via BRImo"],
  // Top up e-wallet: merchant dari kamus, kategori dari jenis transaksi.
  ["2026-04-16 16:57:56", "BRIVA90000000000002NBMBSHOPEE ESB:NBMB:000CD00P:900000000008", 60000, 0, "Top Up Shopee 0812xxxx000 via BRImo"],
  // Biaya bank.
  ["2026-04-16 23:59:59", "Admin Fee", 6000, 0, "Admin Fee"],
  ["2026-04-16 23:59:59", "Monthly Fee ATM", 3000, 0, "Monthly Fee ATM"],
  // Uang masuk.
  ["2026-04-02 17:30:24", "NBMB BUDI HARTONO TO PEMILIK REKENING ESB:NBMB:0001500F:900000000009", 0, 200000, "Transfer Dari Budi Hartono via BRImo"],
];

const BRIMO_MAY = [
  ["2026-05-01 09:34:05", "QRISRNS900000000010#9360000900000000001 ESB:NBMB:000R100P:900000000010", 32875, 0, "QRISRNS900000000010#9360000900000000001"],
  ["2026-05-01 18:33:17", "BRIVA90000000000003NBMBMyTelkomsel ESB:NBMB:000CD00P:900000000011", 51000, 0, "Pembayaran BRIVA ke PT. Finnet Indonesia (My Telkomsel-Telkomsel) - MyTelkomsel via BRImo"],
  ["2026-05-02 09:08:26", "BRIVA90000000000004NBMBPDAM ESB:NBMB:0200200P:900000000012", 102650, 0, "Pembayaran BRIVA ke PDAM Kab Contoh - 90000000000004 via BRImo"],
  ["2026-05-09 12:00:49", "QRIS900000000013#9360000900000000004 ESB:NBMB:0007X00P:900000000013", 77100, 0, "Pembayaran QRIS AIOLA EATERY CASHIER 2"],
  ["2026-05-21 05:59:50", "081200000000 T0000000 000000000001 ESB:EJLN:000HF00P:900000000014", 300000, 0, "Penarikan tunai di ATM - RS CONTOH SEJAHTERA via BRImo"],
  ["2026-05-27 18:14:01", "NBMB RATNA DEWI TO PEMILIK REKENING ESB:NBMB:0001500F:900000000015", 0, 10000000, "Transfer Dari Ratna Dewi via BRImo"],
];

// Saldo awal Mei dibuat menyambung dari saldo akhir April, seperti file asli.
const APR_OPENING = 20702888.48;
const aprNet = BRIMO_APR.reduce((s, [, , d, c]) => s - d + c, 0);

writeFileSync(join(outDir, "brimo-apr.csv"), brimoCsv(BRIMO_APR, APR_OPENING), "utf8");
writeFileSync(join(outDir, "brimo-may.csv"), brimoCsv(BRIMO_MAY, APR_OPENING + aprNet), "utf8");

// ── CSV tanpa header yang dikenali → harus jatuh ke mesin parser baris ───────
const headerless = [
  "10/04/2026,QRIS 1234 ID1020012312312 WARTEG BAHARI,45000,1955000",
  "11/04/2026,QRIS 5678 ID1020045645645 KIMIA FARMA,120000,1835000",
  "12/04/2026,TRANSFER KE AGUS SETIAWAN,300000,1535000",
].join("\n");
writeFileSync(join(outDir, "statement-headerless.csv"), headerless, "utf8");

console.log("Fixture dibuat di", outDir);

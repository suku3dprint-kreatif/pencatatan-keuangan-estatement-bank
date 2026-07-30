/**
 * Test khusus format ekspor BRImo dan penggabungan multi-file.
 *
 * Format ini diuji terpisah karena bentuknya menabrak hampir semua asumsi awal
 * parser: nama kolom teknis (TGL_TRAN, DESK_TRAN, MUTASI_DEBET), delimiter koma
 * dengan desimal bergaya Inggris, dua kolom saldo (awal dan akhir), dan
 * keterangan yang sering hanya berisi kode tanpa nama merchant.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseStatement } from "../src/lib/parse/index.ts";
import { mergeStatements } from "../src/lib/analysis/merge.ts";
import { computeMetrics } from "../src/lib/analysis/metrics.ts";
import { matchField, mergeDescription } from "../src/lib/parse/csv.ts";
import { isQris, extractQrisMeta } from "../src/lib/qris/detect.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");

before(() => {
  execFileSync(process.execPath, [join(here, "make-fixtures.mjs")], { stdio: "pipe" });
});

function load(fileName) {
  return { fileName, bytes: new Uint8Array(readFileSync(join(fixtures, fileName))) };
}

function find(transactions, needle) {
  const hit = transactions.find((t) => t.description.includes(needle));
  assert.ok(hit, `tidak ada transaksi yang keterangannya memuat "${needle}"`);
  return hit;
}

// ── Pemetaan nama kolom ──────────────────────────────────────────────────────

test("matchField: nama kolom teknis BRImo", () => {
  assert.equal(matchField("TGL_TRAN"), "date");
  assert.equal(matchField("DESK_TRAN"), "description");
  assert.equal(matchField("REMARK_CUSTOM"), "remark");
  assert.equal(matchField("GLSIGN"), "type");
  // "MUTASI_DEBET" mengandung "mutasi" (alias kolom nominal generik) — kolom
  // debet harus menang, kalau tidak arah dananya hilang.
  assert.equal(matchField("MUTASI_DEBET"), "debit");
  assert.equal(matchField("MUTASI_KREDIT"), "credit");
  assert.equal(matchField("SALDO_AKHIR_MUTASI"), "balance");
});

test("matchField: saldo AWAL harus diabaikan", () => {
  // Kalau ini terambil sebagai kolom saldo, grafik saldo dan rekonsiliasi arah
  // dana bergeser satu baris.
  assert.equal(matchField("SALDO_AWAL_MUTASI"), null);
  assert.equal(matchField("Opening Balance"), null);
});

test("matchField: kolom lain tidak salah tertebak", () => {
  for (const h of ["ID", "NOREK", "SEQ", "TRUSER", "KODE_TRAN", "TRREMK", "TLBDS1", "JAM_TRAN"]) {
    assert.equal(matchField(h), null, `${h} seharusnya tidak dipetakan ke field mana pun`);
  }
});

test("mergeDescription: keterangan manusia digabung, yang mengulang tidak", () => {
  const kode = "QRIS119956856287#9360000200122788552 ESB:NBMB:0007X00P:119956856287";
  // Remark memuat nama merchant yang tidak ada di kode → keduanya dipakai.
  const merged = mergeDescription(kode, "Pembayaran QRIS FAMILYMART CONTOH RAYA");
  assert.ok(merged.includes("FAMILYMART"));
  assert.ok(merged.includes("9360000200122788552"), "kode teknis harus ikut, supaya MPAN tetap terbaca");
  // Remark yang cuma mengulang kode tidak digandakan.
  assert.equal(mergeDescription(kode, kode), kode);
  assert.equal(mergeDescription("Admin Fee", "Admin Fee"), "Admin Fee");
});

// ── Deteksi QRIS format BRImo ────────────────────────────────────────────────

test("isQris: prefiks menempel ke kode, tanpa spasi", () => {
  assert.equal(isQris("QRISRNS119003178520#9360000210027337763"), true);
  assert.equal(isQris("QRIS119026531635#9360000210027337763"), true);
  // Tanpa kata QRIS pun, merchant PAN berawalan 936 sudah menandakan QRIS.
  assert.equal(isQris("456042#170675158668#9360000215166209471"), true);
  assert.equal(isQris("Admin Fee"), false);
});

test("extractQrisMeta: merchant PAN 936 terbaca", () => {
  const meta = extractQrisMeta("QRIS119956856287#9360000200122788552 ESB:NBMB:0007X00P:119956856287");
  assert.equal(meta.mpan, "9360000200122788552");
});

// ── Parsing berkas BRImo ─────────────────────────────────────────────────────

test("CSV BRImo: semua baris terbaca dan saldonya rekonsiliasi", async () => {
  const r = await parseStatement(load("brimo-apr.csv"));

  assert.equal(r.bank, "bri");
  // 15 baris di file, satu di antaranya baris biaya yang digabung ke induknya.
  assert.equal(r.meta.rows, 14);
  assert.equal(r.meta.periodStart, "2026-04-01");
  assert.equal(r.meta.periodEnd, "2026-04-18");

  // Rekonsiliasi: saldo awal baris pertama + seluruh mutasi harus sama dengan
  // saldo akhir baris terakhir. Ini bukti tidak ada baris terlewat atau ganda.
  const net = r.transactions.reduce(
    (s, t) => s + (t.direction === "credit" ? t.amount : -t.amount),
    0,
  );
  const opening = 20_702_888.48;
  const closing = r.transactions[r.transactions.length - 1].balance;
  assert.ok(
    Math.abs(opening + net - closing) < 0.01,
    `saldo tidak rekonsiliasi: ${opening} + ${net} ≠ ${closing}`,
  );

  // Kolom saldo harus SALDO_AKHIR, bukan SALDO_AWAL.
  const pertama = r.transactions.find((t) => t.date === "2026-04-01");
  assert.equal(pertama.balance, 19_779_454.48);
});

test("CSV BRImo: nominal gaya Inggris tanpa pemisah ribuan", async () => {
  const r = await parseStatement(load("brimo-apr.csv"));
  // "923434.00" harus jadi 923434, bukan 92343400 atau 923.434.
  assert.equal(r.transactions[0].amount, 923_434);
  const masuk = find(r.transactions, "Budi Hartono");
  assert.equal(masuk.direction, "credit");
  assert.equal(masuk.amount, 200_000);
});

test("QRIS tanpa nama merchant ditandai, bukan dikirim ke AI", async () => {
  const r = await parseStatement(load("brimo-apr.csv"));
  const kosong = r.transactions.filter((t) => t.noMerchantInfo);
  assert.equal(kosong.length, 2, "dua baris QRIS di fixture memang hanya berisi kode");
  for (const t of kosong) {
    assert.equal(t.merchant, "QRIS tanpa nama merchant");
    assert.equal(t.source, "rule");
  }
  // Yang tidak bisa dianalisa tidak boleh dihitung sebagai "butuh AI" —
  // mengirimnya hanya membuang token dan memancing nama merchant karangan.
  assert.ok(
    r.meta.needsAi < kosong.length + 2,
    "transaksi tanpa informasi merchant tidak boleh masuk hitungan needsAi",
  );
});

test("nama merchant dari REMARK_CUSTOM dipakai untuk klasifikasi", async () => {
  const r = await parseStatement(load("brimo-apr.csv"));

  const fm = find(r.transactions, "FAMILYMART");
  assert.equal(fm.merchant, "FamilyMart");
  assert.equal(fm.category, "groceries");

  const spbu = find(r.transactions, "SPBU");
  assert.equal(spbu.merchant, "SPBU");
  assert.equal(spbu.category, "transportasi");

  const pln = find(r.transactions, "Token PLN");
  assert.equal(pln.merchant, "PLN");
  assert.equal(pln.category, "tagihan");
});

test("lokasi ATM tidak boleh dianggap merchant", async () => {
  const r = await parseStatement(load("brimo-apr.csv"));
  // "Penarikan tunai di ATM - RS CONTOH SEJAHTERA" — kamus mencocokkan "RS " ke
  // fasilitas kesehatan, tapi ini tarik tunai, bukan belanja kesehatan.
  const tarik = find(r.transactions, "CONTOH SEJAHTERA");
  assert.equal(tarik.kind, "withdrawal");
  assert.equal(tarik.category, "tarik_tunai");
  assert.notEqual(tarik.category, "kesehatan");
});

test("top up e-wallet: merchant dari kamus, kategori dari jenis transaksi", async () => {
  const r = await parseStatement(load("brimo-apr.csv"));
  const topup = find(r.transactions, "Top Up Shopee");
  assert.equal(topup.merchant, "Shopee");
  assert.equal(topup.category, "topup_ewallet", "top up saldo bukan belanja online");
});

test("transfer BI-Fast: nama penerima diambil, bukan nama banknya", async () => {
  const r = await parseStatement(load("brimo-apr.csv"));
  const trf = r.transactions.filter((t) => t.description.includes("BFST"));
  assert.equal(trf.length, 1, "pokok dan biaya transfer digabung jadi satu transaksi");
  assert.equal(trf[0].category, "transfer_keluar");
  assert.ok(
    trf[0].merchant?.toLowerCase().includes("sari"),
    `nama penerima harus terbaca, dapatnya "${trf[0].merchant}"`,
  );
});

// ── Penggabungan baris biaya ke transaksi induknya ───────────────────────────

test("baris biaya digabung ke induknya, total tidak berubah", async () => {
  const r = await parseStatement(load("brimo-apr.csv"));

  const trf = r.transactions.find((t) => t.description.includes("BFST"));
  // Nominal transaksi menjadi pokok + biaya, sehingga total pengeluaran tetap.
  assert.equal(trf.amount, 92_500);
  // Besar biayanya tetap tercatat, supaya bisa ditampilkan terpisah di tabel.
  assert.equal(trf.fee, 2_500);

  // Saldo yang dipakai adalah saldo SETELAH biaya, bukan saldo di antara
  // keduanya — kalau tidak, grafik saldo meleset sebesar biayanya.
  assert.equal(trf.balance, 19_400_824.48);

  assert.ok(
    r.warnings.some((w) => w.level === "info" && w.message.includes("baris biaya")),
    "penggabungan harus diberitahukan, karena jumlah baris jadi berbeda dari file",
  );
});

test("penggabungan biaya tidak mengubah rekonsiliasi saldo", async () => {
  // Uji paling penting dari fitur ini: apa pun yang digabung, saldo awal +
  // seluruh mutasi harus tetap sama dengan saldo akhir.
  for (const file of ["brimo-apr.csv", "brimo-may.csv"]) {
    const r = await parseStatement(load(file));
    const net = r.transactions.reduce(
      (s, t) => s + (t.direction === "credit" ? t.amount : -t.amount),
      0,
    );
    const opening = r.transactions[0].balance
      + (r.transactions[0].direction === "credit" ? -r.transactions[0].amount : r.transactions[0].amount);
    const closing = r.transactions[r.transactions.length - 1].balance;
    assert.ok(
      Math.abs(opening + net - closing) < 0.01,
      `${file}: saldo tidak rekonsiliasi setelah biaya digabung`,
    );
  }
});

test("transaksi kecil yang bukan biaya tidak digabung", async () => {
  const r = await parseStatement(load("brimo-may.csv"));
  // Dua pembayaran di merchant yang sama pada hari yang sama: Rp 77.100 dan
  // Rp 20.000. Yang kedua di bawah Rp 25.000 tapi lebih dari 10% yang pertama,
  // jadi ini belanja terpisah — bukan biaya bank.
  const aiola = r.transactions.filter((t) => t.description.includes("AIOLA"));
  assert.equal(aiola.length, 2, "dua transaksi terpisah harus tetap dua baris");
  assert.deepEqual(aiola.map((t) => t.amount).sort((a, b) => a - b), [20_000, 77_100]);
  assert.ok(aiola.every((t) => t.fee === undefined));
});

test("biaya bank terdeteksi", async () => {
  const r = await parseStatement(load("brimo-apr.csv"));
  for (const needle of ["Admin Fee", "Monthly Fee ATM"]) {
    const t = find(r.transactions, needle);
    assert.equal(t.kind, "fee");
    assert.equal(t.category, "biaya_admin");
  }
});

// ── Penggabungan multi-file ──────────────────────────────────────────────────

test("gabung dua bulan: transaksi dijumlah, tanpa duplikat", async () => {
  const apr = await parseStatement(load("brimo-apr.csv"));
  const may = await parseStatement(load("brimo-may.csv"));
  const m = mergeStatements([apr, may]);

  assert.equal(m.files.length, 2);
  assert.equal(m.transactions.length, apr.meta.rows + may.meta.rows);
  assert.equal(m.duplicatesRemoved, 0, "April dan Mei tidak tumpang tindih");
  assert.equal(m.bankLabel, apr.bankLabel);
  assert.equal(m.periodStart, "2026-04-01");
  assert.equal(m.periodEnd, "2026-05-27");

  // ID harus unik secara global, kalau tidak React dan tabel akan kacau.
  const ids = new Set(m.transactions.map((t) => t.id));
  assert.equal(ids.size, m.transactions.length, "ID transaksi harus unik setelah digabung");

  // Setiap transaksi tahu asal filenya.
  assert.ok(m.transactions.every((t) => t.sourceFile));
  const names = new Set(m.transactions.map((t) => t.sourceFile));
  assert.deepEqual([...names].sort(), ["brimo-apr.csv", "brimo-may.csv"]);

  // Urut menurut tanggal setelah digabung.
  const dates = m.transactions.map((t) => t.date);
  assert.deepEqual(dates, [...dates].sort());
});

test("gabung file yang sama dua kali: semua duplikat dibuang", async () => {
  const a = await parseStatement(load("brimo-apr.csv"));
  const b = await parseStatement(load("brimo-apr.csv"));
  const m = mergeStatements([a, b]);

  assert.equal(m.transactions.length, a.meta.rows, "tidak boleh ada transaksi yang terhitung dua kali");
  assert.equal(m.duplicatesRemoved, a.meta.rows);
  assert.ok(
    m.warnings.some((w) => w.message.includes("tumpang tindih")),
    "harus memberi tahu bahwa periodenya tumpang tindih",
  );
});

test("gabung: baris kembar di dalam SATU file tetap dipertahankan", async () => {
  // Di April ada "Admin Fee" dan "Monthly Fee ATM" pada timestamp yang sama,
  // dan tiga belanja di FamilyMart dengan pola keterangan serupa. Semuanya sah
  // dan harus utuh, kalau tidak totalnya berubah.
  const apr = await parseStatement(load("brimo-apr.csv"));
  const m = mergeStatements([apr]);
  assert.equal(m.transactions.length, apr.meta.rows);
  assert.equal(m.duplicatesRemoved, 0);
});

test("metrik gabungan menjumlahkan kedua bulan", async () => {
  const apr = await parseStatement(load("brimo-apr.csv"));
  const may = await parseStatement(load("brimo-may.csv"));
  const m = mergeStatements([apr, may]);
  const metrics = computeMetrics(m.transactions);

  assert.equal(metrics.byMonth.length, 2);
  assert.deepEqual(metrics.byMonth.map((x) => x.month), ["2026-04", "2026-05"]);
  assert.equal(metrics.income, 200_000 + 10_000_000);
  // Transaksi tanpa nama merchant dilaporkan terpisah, tidak dihitung
  // "teridentifikasi" — supaya persentasenya jujur.
  assert.equal(metrics.noMerchantInfoCount, m.noMerchantInfo);
  assert.ok(metrics.identifiedShare < 1);
});

// ── Deteksi beban berulang ───────────────────────────────────────────────────

test("beban berulang: tiga kejadian terbukti, dua kejadian hanya dugaan", async () => {
  const apr = await parseStatement(load("brimo-apr.csv"));
  const may = await parseStatement(load("brimo-may.csv"));
  const { recurring } = computeMetrics(mergeStatements([apr, may]).transactions);
  const byName = new Map(recurring.map((r) => [r.merchant, r]));

  // Tiga belanja mingguan dengan nominal stabil → pola terbukti.
  const fm = byName.get("FamilyMart");
  assert.ok(fm, `FamilyMart harus terdeteksi berulang; yang ada: ${[...byName.keys()]}`);
  assert.equal(fm.occurrences, 3);
  assert.ok(!fm.tentative, "tiga kejadian bukan lagi dugaan");
  assert.equal(fm.intervalDays, 7);

  // Biaya bulanan yang cuma muncul dua kali → diterima, tapi ditandai dugaan.
  const admin = byName.get("Admin Fee");
  assert.ok(admin, "biaya bulanan dua kali berjarak sebulan harus terdeteksi");
  assert.equal(admin.occurrences, 2);
  assert.equal(admin.tentative, true);
  assert.equal(admin.intervalDays, 30);
});

test("beban berulang: kenaikan nominal kecil tetap dianggap langganan yang sama", async () => {
  // Monthly Fee ATM naik Rp 3.000 → Rp 3.500. Naik 15%, jadi lolos ambang
  // relatif 10% saja tidak cukup — yang menolongnya adalah selisih absolut
  // Rp 500 yang jelas masih biaya bulanan yang sama.
  const apr = await parseStatement(load("brimo-apr.csv"));
  const may = await parseStatement(load("brimo-may.csv"));
  const { recurring } = computeMetrics(mergeStatements([apr, may]).transactions);

  const atm = recurring.find((r) => r.merchant === "Monthly Fee ATM");
  assert.ok(atm, "biaya bulanan ATM harus tetap terdeteksi meski nominalnya naik");
  assert.equal(atm.avgAmount, 3_250);
  assert.equal(atm.tentative, true);
});

test("beban berulang: biaya diberi nama sendiri, bukan disatukan jadi 'Biaya Bank'", async () => {
  // Kalau semua biaya dilabeli sama, Admin Fee dan Monthly Fee ATM tercampur
  // dalam satu kelompok dan nominalnya jadi tampak acak — tidak satu pun
  // terdeteksi sebagai beban bulanan.
  const r = await parseStatement(load("brimo-apr.csv"));
  const names = r.transactions.filter((t) => t.kind === "fee").map((t) => t.merchant);
  assert.deepEqual(names.sort(), ["Admin Fee", "Monthly Fee ATM"]);
});

test("beban berulang: label keranjang tidak boleh jadi 'langganan'", async () => {
  // Dua tarik tunai Rp 300.000 berjarak sebulan memenuhi semua syarat angka,
  // tapi "Tarik Tunai" adalah nama keranjang — bukan pihak yang dibayar.
  const apr = await parseStatement(load("brimo-apr.csv"));
  const may = await parseStatement(load("brimo-may.csv"));
  const m = mergeStatements([apr, may]);

  const tarik = m.transactions.filter((t) => t.category === "tarik_tunai");
  assert.equal(tarik.length, 2, "fixture memang punya dua tarik tunai bernominal sama");

  const { recurring } = computeMetrics(m.transactions);
  for (const label of ["Tarik Tunai", "Pembayaran Tagihan", "Transfer Keluar", "Biaya Bank"]) {
    assert.ok(
      !recurring.some((r) => r.merchant === label),
      `"${label}" adalah label keranjang, tidak boleh dilaporkan sebagai beban berulang`,
    );
  }
});

test("gabung file dari bank berbeda memberi peringatan", async () => {
  const brimo = await parseStatement(load("brimo-apr.csv"));
  const bsi = await parseStatement(load("statement-bsi.pdf"));
  const m = mergeStatements([brimo, bsi]);

  assert.equal(m.banks.length, 2);
  assert.ok(
    m.warnings.some((w) => w.level === "warn" && w.message.includes("bank berbeda")),
    "menggabung bank berbeda harus diberi peringatan",
  );
});

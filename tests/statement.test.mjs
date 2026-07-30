/**
 * Integration test: fixture e-statement sintetis → `parseStatement`.
 *
 * Ini yang menjaga parser dari regresi. Test unit memeriksa fungsi-fungsi kecil;
 * test ini memeriksa hasil akhir yang benar-benar dilihat pengguna — jumlah
 * transaksi, arah dana, nominal, saldo, dan hasil klasifikasi.
 *
 * Dijalankan langsung terhadap fungsi library (bukan lewat HTTP), jadi tidak
 * butuh server dan aman dipakai di CI.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseStatement } from "../src/lib/parse/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures");

before(() => {
  // Fixture tidak di-commit (di-gitignore), jadi dibuat dulu.
  execFileSync(process.execPath, [join(here, "make-fixtures.mjs")], { stdio: "pipe" });
});

function load(fileName) {
  return {
    fileName,
    bytes: new Uint8Array(readFileSync(join(fixtures, fileName))),
  };
}

/** Cari transaksi berdasarkan potongan keterangannya. */
function find(transactions, needle) {
  const hit = transactions.find((t) => t.description.includes(needle));
  assert.ok(hit, `tidak ada transaksi yang keterangannya memuat "${needle}"`);
  return hit;
}

test("PDF BSI: dua kolom debet/kredit terpisah", async () => {
  const r = await parseStatement(load("statement-bsi.pdf"));

  assert.equal(r.bank, "bsi");
  assert.ok(r.bankConfidence >= 0.5, "bank harus terdeteksi dengan yakin");
  assert.equal(r.meta.rows, 15, "15 baris transaksi, di luar SALDO AWAL & footer");
  assert.equal(r.meta.periodStart, "2026-02-01");
  assert.equal(r.meta.periodEnd, "2026-02-28");

  // Baris non-transaksi harus dilewati.
  assert.equal(
    r.transactions.filter((t) => /SALDO AWAL|Halaman/i.test(t.description)).length,
    0,
  );

  // Dua kolom terpisah tanpa penanda DB/CR: arah dana harus tetap benar.
  const gaji = find(r.transactions, "GAJI PT SUMBER MAKMUR");
  assert.equal(gaji.direction, "credit");
  assert.equal(gaji.amount, 12_500_000);
  assert.equal(gaji.category, "pendapatan");

  const bagiHasil = find(r.transactions, "BAGI HASIL");
  assert.equal(bagiHasil.direction, "credit");
  assert.equal(bagiHasil.amount, 12_450);

  const indomaret = find(r.transactions, "INDOMARET");
  assert.equal(indomaret.direction, "debit");
  assert.equal(indomaret.amount, 43_500);
  assert.equal(indomaret.balance, 4_931_500);
  assert.equal(indomaret.merchant, "Indomaret");
  assert.equal(indomaret.category, "groceries");
  assert.equal(indomaret.source, "dictionary");

  // Nominal besar dengan dua pemisah ribuan.
  const bangunan = find(r.transactions, "TK BANGUNAN MAJU");
  assert.equal(bangunan.amount, 1_250_000);
  assert.equal(bangunan.kind, "qris");
  assert.equal(bangunan.qris?.nmid, "ID1020033344455");

  // Semua transaksi kredit dan debit terhitung utuh.
  const credits = r.transactions.filter((t) => t.direction === "credit");
  assert.equal(credits.length, 2);
  assert.equal(
    r.transactions.reduce((s, t) => s + t.amount, 0),
    12_500_000 + 12_450 + 25_000 + 43_500 + 500_000 + 22_000 + 5_000 + 18_000 +
      350_000 + 31_000 + 200_000 + 87_500 + 1_000_000 + 186_000 + 1_250_000,
  );
});

test("PDF BCA: satu kolom mutasi + penanda DB, tanggal tanpa tahun", async () => {
  const r = await parseStatement(load("statement-bca.pdf"));

  assert.equal(r.bank, "bca");
  assert.equal(r.meta.rows, 5);

  // Tahun tidak ada di kolom tanggal ("05/01") — harus dilengkapi dari
  // "PERIODE : JANUARI 2026" di header.
  assert.ok(
    r.transactions.every((t) => t.date.startsWith("2026-01-")),
    "semua tanggal harus terisi tahun 2026",
  );

  const alfamart = find(r.transactions, "ALFAMART");
  assert.equal(alfamart.date, "2026-01-05");
  assert.equal(alfamart.direction, "debit");
  assert.equal(alfamart.amount, 37_500);
  assert.equal(alfamart.merchant, "Alfamart");

  // Baris tanpa penanda DB adalah uang masuk.
  const masuk = find(r.transactions, "DEWI LESTARI");
  assert.equal(masuk.direction, "credit");
  assert.equal(masuk.amount, 1_500_000);

  // Kolom "CBG" berisi "0000" — tidak boleh terbaca sebagai nominal.
  assert.ok(
    r.transactions.every((t) => t.amount > 0),
    "tidak boleh ada transaksi bernominal nol",
  );
});

test("CSV Mandiri: delimiter titik koma + baris basa-basi sebelum header", async () => {
  const r = await parseStatement(load("statement-mandiri.csv"));

  assert.equal(r.bank, "mandiri");
  assert.equal(r.meta.rows, 8);
  assert.equal(r.meta.fileType, "csv");

  // Kalau delimiter salah tertebak sebagai koma, nominal terbelah dua dan
  // angkanya jadi 22 bukan 22.000.
  const mixue = find(r.transactions, "MIXUE");
  assert.equal(mixue.amount, 22_000);
  assert.equal(mixue.balance, 3_478_000);
  assert.equal(mixue.merchant, "Mixue");

  const masuk = find(r.transactions, "SITI AMINAH");
  assert.equal(masuk.direction, "credit");
  assert.equal(masuk.amount, 750_000);
  assert.equal(masuk.category, "transfer_masuk");

  // Delimiter yang terpakai dilaporkan ke pengguna.
  assert.ok(
    r.warnings.some((w) => w.message.includes('Delimiter ";"')),
    "harus melaporkan delimiter yang dipakai",
  );
});

test("CSV tanpa header: jatuh ke mesin parser berbasis baris", async () => {
  const r = await parseStatement(load("statement-headerless.csv"));

  assert.equal(r.meta.rows, 3);
  assert.ok(
    r.warnings.some((w) => w.message.includes("Header kolom CSV tidak dikenali")),
    "harus memberi tahu bahwa header tidak terbaca",
  );

  const warteg = find(r.transactions, "WARTEG BAHARI");
  assert.equal(warteg.amount, 45_000);
  assert.equal(warteg.balance, 1_955_000);
  assert.equal(warteg.category, "makan_minum");
});

test("file yang bukan statement tidak bikin parser meledak", async () => {
  const r = await parseStatement({
    fileName: "acak.csv",
    bytes: new TextEncoder().encode("halo\nini bukan statement\nsama sekali\n"),
  });
  assert.equal(r.meta.rows, 0);
  // Harus ada peringatan yang bisa dibaca pengguna, bukan error.
  assert.ok(r.warnings.some((w) => w.level === "warn"));
});

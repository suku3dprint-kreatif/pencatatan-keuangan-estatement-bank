/**
 * Unit test untuk fungsi parser murni — bagian paling berisiko dari tools ini,
 * karena satu salah tafsir pemisah ribuan berarti nominalnya salah 100x.
 *
 * Jalankan: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findDate,
  findLeadingDate,
  findPeriod,
  parseAmount,
  resolveYear,
} from "../src/lib/parse/primitives.ts";
import { looksLikeAmount, reconcileWithBalance } from "../src/lib/parse/engine.ts";
import { detectDelimiter } from "../src/lib/parse/csv.ts";
import { detectBank } from "../src/lib/parse/banks.ts";
import { extractQrisMeta, detectKind, isQris } from "../src/lib/qris/detect.ts";
import { classifyByRules, extractCounterparty } from "../src/lib/qris/rules.ts";
import { dedupKey } from "../src/lib/ai/dedup.ts";

test("parseAmount: format Indonesia", () => {
  assert.equal(parseAmount("1.234.567,89"), 1234567.89);
  assert.equal(parseAmount("25.000,00"), 25000);
  assert.equal(parseAmount("1.000"), 1000);
  assert.equal(parseAmount("999"), 999);
  assert.equal(parseAmount("12.450,00"), 12450);
  assert.equal(parseAmount("Rp 350.000,00"), 350000);
});

test("parseAmount: format Inggris", () => {
  assert.equal(parseAmount("1,234,567.89"), 1234567.89);
  assert.equal(parseAmount("1,234"), 1234);
  assert.equal(parseAmount("1234.56"), 1234.56);
});

test("parseAmount: tanda negatif", () => {
  assert.equal(parseAmount("-25.000,00"), -25000);
  assert.equal(parseAmount("25.000,00-"), -25000);
  assert.equal(parseAmount("(25.000,00)"), -25000);
});

test("parseAmount: bukan angka", () => {
  assert.equal(parseAmount("QRIS"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("abc123"), null);
});

test("looksLikeAmount: tolak nomor referensi & tahun polos", () => {
  assert.equal(looksLikeAmount("25.000,00"), true);
  assert.equal(looksLikeAmount("1234"), true);
  // Nomor referensi panjang tanpa pemisah bukan nominal.
  assert.equal(looksLikeAmount("1234567890123"), false);
  // Tahun polos sering nyempil di kolom keterangan.
  assert.equal(looksLikeAmount("2026"), false);
  assert.equal(looksLikeAmount("QRIS"), false);
});

test("findDate: berbagai format", () => {
  assert.equal(findDate("05/01/2026")?.iso, "2026-01-05");
  assert.equal(findDate("05-01-26")?.iso, "2026-01-05");
  assert.equal(findDate("2026-01-05")?.iso, "2026-01-05");
  assert.equal(findDate("5 Jan 2026")?.iso, "2026-01-05");
  assert.equal(findDate("5 Januari 2026")?.iso, "2026-01-05");
  // Tanpa tahun → tahun ditandai untuk diisi belakangan.
  assert.equal(findDate("05 JAN")?.iso, "????-01-05");
});

test("findDate: tolak tanggal yang tidak ada", () => {
  assert.equal(findDate("32/01/2026"), null);
  assert.equal(findDate("05/13/2026"), null);
});

test("findLeadingDate: hanya tanggal di kolom paling kiri", () => {
  assert.equal(findLeadingDate("05/01/2026 QRIS INDOMARET")?.iso, "2026-01-05");
  // Angka di tengah keterangan tidak boleh dianggap tanggal transaksi.
  assert.equal(findLeadingDate("QRIS PEMBAYARAN TANGGAL 05/01/2026"), null);
});

test("resolveYear: isi tahun dari periode statement", () => {
  assert.equal(resolveYear("????-01-05", "2026-01-01", "2026-01-31"), "2026-01-05");
  // Periode lintas tahun: pilih tahun yang membuat tanggalnya masuk rentang.
  assert.equal(resolveYear("????-01-05", "2025-12-15", "2026-01-15"), "2026-01-05");
  assert.equal(resolveYear("2026-03-01"), "2026-03-01");
});

test("findPeriod: baca rentang dari header", () => {
  assert.deepEqual(findPeriod("PERIODE : 01/02/2026 s/d 28/02/2026"), {
    start: "2026-02-01",
    end: "2026-02-28",
  });
  assert.deepEqual(findPeriod("Periode JANUARI 2026"), {
    start: "2026-01-01",
    end: "2026-01-31",
  });
});

test("detectDelimiter: titik koma menang atas koma desimal", () => {
  // Ini kasus nyata CSV bank Indonesia: koma dipakai sebagai desimal, jadi
  // heuristik bawaan papaparse salah menebaknya sebagai delimiter.
  const csv = [
    "Tanggal;Keterangan;Debit;Saldo",
    "01/03/2026;QRIS MIXUE;22.000,00;3.478.000,00",
    "02/03/2026;QRIS GRABFOOD;35.000,00;3.443.000,00",
  ].join("\n");
  assert.equal(detectDelimiter(csv), ";");
});

test("detectDelimiter: koma tetap terpakai kalau memang delimiternya", () => {
  const csv = ["Tanggal,Keterangan,Debit", "01/03/2026,QRIS MIXUE,22000"].join("\n");
  assert.equal(detectDelimiter(csv), ",");
});

test("detectDelimiter: tab", () => {
  const csv = ["Tanggal\tKeterangan\tDebit", "01/03/2026\tQRIS MIXUE\t22000"].join("\n");
  assert.equal(detectDelimiter(csv), "\t");
});

test("detectBank: nama lengkap mengalahkan singkatan", () => {
  assert.equal(detectBank("PT BANK SYARIAH INDONESIA TBK - MUTASI").profile.id, "bsi");
  assert.equal(detectBank("PT BANK CENTRAL ASIA TBK KLIKBCA").profile.id, "bca");
  assert.equal(detectBank("BANK RAKYAT INDONESIA BRImo").profile.id, "bri");
  assert.equal(detectBank("Statement tanpa nama bank").profile.id, "generic");
});

test("reconcileWithBalance: koreksi arah dana dari selisih saldo", () => {
  // Arah awal salah semua (debit), tapi selisih saldo naik → harus jadi kredit.
  const records = [
    { date: "2026-01-01", description: "A", amount: 100, direction: "debit", balance: 1000, directionConfidence: 0.3, origin: "" },
    { date: "2026-01-02", description: "B", amount: 500, direction: "debit", balance: 1500, directionConfidence: 0.3, origin: "" },
    { date: "2026-01-03", description: "C", amount: 200, direction: "debit", balance: 1300, directionConfidence: 0.3, origin: "" },
  ];
  const corrected = reconcileWithBalance(records);
  assert.equal(corrected, 1);
  assert.equal(records[1].direction, "credit");
  assert.equal(records[2].direction, "debit");
  assert.equal(records[1].directionConfidence, 1);
});

test("isQris & extractQrisMeta", () => {
  assert.equal(isQris("QRIS 1234567890123 ID1020012345678 WRG MKN BU SRI"), true);
  assert.equal(isQris("TRSF E-BANKING DB BUDI SANTOSO"), false);

  const meta = extractQrisMeta("QRIS 1234567890123 ID1020012345678 GOPAY WRG MKN BU SRI");
  assert.equal(meta.nmid, "ID1020012345678");
  assert.equal(meta.acquirer, "GOPAY");
  // Kode & token sampah dibuang, sisa teks jadi kandidat nama merchant.
  assert.equal(meta.nameHint, "WRG MKN BU SRI");
});

test("detectKind: jenis transaksi", () => {
  assert.equal(detectKind("QRIS 123 INDOMARET", "debit"), "qris");
  assert.equal(detectKind("TARIK TUNAI ATM 1234", "debit"), "withdrawal");
  assert.equal(detectKind("GAJI PT SUMBER MAKMUR", "credit"), "payroll");
  assert.equal(detectKind("BIAYA ADM", "debit"), "fee");
  assert.equal(detectKind("BAGI HASIL TABUNGAN", "credit"), "interest");
  assert.equal(detectKind("TRSF E-BANKING DB BUDI", "debit"), "transfer_out");
  assert.equal(detectKind("TRANSFER MASUK BIFAST SITI", "credit"), "transfer_in");
});

test("classifyByRules: kamus merchant", () => {
  const r = classifyByRules("QRIS PAYMENT INDOMARET CIPETE 9988776655", "qris", "debit");
  assert.equal(r.merchant, "Indomaret");
  assert.equal(r.category, "groceries");
  assert.equal(r.source, "dictionary");
  assert.ok(r.confidence >= 0.9);
});

test("classifyByRules: QRIS di merchant e-wallet bukan top up", () => {
  // "GOPAY" muncul sebagai acquirer, tapi jenisnya QRIS → ini pembayaran.
  const r = classifyByRules("QRIS 123 GOPAY MERCHANT", "qris", "debit");
  assert.notEqual(r.category, "topup_ewallet");
  // Sedangkan top up sebenarnya tetap masuk kategori top up.
  const t = classifyByRules("TOP UP GOPAY 081234567890", "topup", "debit");
  assert.equal(t.category, "topup_ewallet");
});

test("classifyByRules: yang benar-benar tak dikenal ditandai unknown", () => {
  const r = classifyByRules("QRIS 998877 ID1020099988877 ZZQX PRIMA", "qris", "debit");
  assert.equal(r.source, "unknown");
  assert.ok(r.confidence < 0.5);
});

test("extractCounterparty: nama lawan transaksi", () => {
  assert.equal(
    extractCounterparty("TRSF E-BANKING DB 0302/FTSCY/WS95051 BUDI SANTOSO"),
    "BUDI SANTOSO",
  );
});

test("dedupKey: nomor referensi diabaikan", () => {
  const a = dedupKey("QRIS 1234567890123 ID1020012345678 INDOMARET CIPETE");
  const b = dedupKey("QRIS 9999999999999 ID1020099999999 INDOMARET CIPETE");
  assert.equal(a, b);
  // Merchant berbeda tetap dianggap berbeda.
  assert.notEqual(a, dedupKey("QRIS 1234567890123 ALFAMART CIPETE"));
});

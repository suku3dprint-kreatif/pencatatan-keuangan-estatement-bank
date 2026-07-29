const IDR = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const IDR_PRECISE = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("id-ID");

export function rupiah(value: number): string {
  return IDR.format(value);
}

export function rupiahPrecise(value: number): string {
  return IDR_PRECISE.format(value);
}

/** Versi ringkas untuk label sumbu chart: Rp1,2 jt / Rp450 rb. */
export function rupiahShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp${(abs / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  if (abs >= 1_000) return `${sign}Rp${Math.round(abs / 1_000)} rb`;
  return `${sign}Rp${Math.round(abs)}`;
}

export function angka(value: number): string {
  return NUM.format(value);
}

export function persen(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-01-05" → "5 Jan 2026" */
export function tanggal(iso: string): string {
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1]?.slice(0, 3) ?? m;
  return `${Number(d)} ${month} ${y}`;
}

/** "2026-01-05" → "5 Januari 2026" */
export function tanggalPanjang(iso: string): string {
  const [y, m, d] = iso.split("-");
  const month = MONTHS[Number(m) - 1] ?? m;
  return `${Number(d)} ${month} ${y}`;
}

export function periode(start?: string, end?: string): string {
  if (!start && !end) return "Periode tidak diketahui";
  if (start && end && start !== end) return `${tanggal(start)} – ${tanggal(end)}`;
  return tanggalPanjang(start ?? end!);
}

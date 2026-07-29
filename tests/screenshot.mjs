/**
 * Render halaman, upload fixture, lalu screenshot dashboard-nya.
 * Dipakai untuk memeriksa layout chart secara visual — validator palet hanya
 * mengecek warna, bukan tabrakan label atau overflow.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "screenshots");
mkdirSync(outDir, { recursive: true });

const BASE = process.env.BASE_URL ?? "http://localhost:3111";
const fixture = join(here, "fixtures", process.argv[2] ?? "statement-bsi.pdf");

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});

for (const theme of ["light", "dark"]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: theme,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.setInputFiles('input[type="file"]', fixture);
  await page.waitForSelector("text=Arus kas per bulan", { timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: join(outDir, `dashboard-${theme}.png`), fullPage: true });
  console.log(`${theme}: screenshot tersimpan`);
  if (errors.length) console.log(`${theme}: console errors →`, errors.slice(0, 5));

  // Cek overflow horizontal pada body — chart lebar harus scroll di dalam
  // wadahnya sendiri, bukan menggeser halaman.
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  console.log(
    `${theme}: lebar dokumen ${overflow.scroll} vs viewport ${overflow.client}`,
    overflow.scroll > overflow.client + 1 ? "→ OVERFLOW!" : "→ ok",
  );

  await context.close();
}

await browser.close();

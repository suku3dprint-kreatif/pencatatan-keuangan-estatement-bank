import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Analisa E-Statement Bank",
  description:
    "Upload e-statement bank (PDF/CSV), biarkan AI menebak merchant di balik kode QRIS, lalu lihat visualisasi dan analisa keuangannya.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-plane text-ink antialiased">{children}</body>
    </html>
  );
}

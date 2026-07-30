import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships its own worker/font plumbing and must not be bundled by
  // Turbopack/webpack for the server runtime.
  serverExternalPackages: ["pdfjs-dist"],

  /**
   * pdfjs memuat worker-nya lewat import dinamis saat runtime, bukan lewat
   * `import` statis yang bisa dilihat bundler. Akibatnya file tracing Next
   * hanya ikut menyalin `pdf.mjs` ke bundle function, sementara
   * `pdf.worker.mjs` tertinggal — dan di serverless itu bikin upload PDF
   * gagal dengan:
   *
   *   Setting up fake worker failed: "Cannot find module
   *   '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'"
   *
   * Di mesin sendiri tidak pernah kelihatan, karena node_modules-nya utuh.
   * Font standar ikut disertakan supaya `standardFontDataUrl` menunjuk ke
   * direktori yang benar-benar ada dan log-nya tidak penuh warning.
   */
  outputFileTracingIncludes: {
    "/api/parse": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**",
    ],
  },
};

export default nextConfig;

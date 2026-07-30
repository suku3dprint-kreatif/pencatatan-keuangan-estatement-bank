import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist ships its own worker/font plumbing and must not be bundled by
  // Turbopack/webpack for the server runtime.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;

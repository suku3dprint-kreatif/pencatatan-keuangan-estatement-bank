import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      // Dihasilkan oleh Next, bukan kode kita.
      "next-env.d.ts",
      // Dihasilkan oleh `npm run fixtures` / `npm run screenshot`.
      "tests/fixtures/**",
      "tests/screenshots/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default config;

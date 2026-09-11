import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      // build di verifica in una cartella a parte (NEXT_DIST_DIR)
      ".next-*/**",
      "out/**",
      "build/**",
      "artifacts/**",
      ".pnpm-store/**",
      ".claude/worktrees/**",
      ".superpowers/**",
      "next-env.d.ts",
      "public/sw.js",
      "public/sw.js.map",
      "public/pdf.worker.min.mjs",
      // decodificatore JBIG2 di pdf.js, copiato da scripts/copy-pdf-worker.mjs
      "public/pdfjs-wasm/**",
      // codice dell'estensione e della sonda: non e' codice Next
      "extension/**",
      "tools/**",
    ],
  },
];

export default eslintConfig;

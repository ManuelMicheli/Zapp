// Copia in public/ (gitignored) i file di pdf.js che il browser deve caricare
// same-origin: la CSP consente solo script da 'self'. Girato in testa a `pnpm dev`
// e `pnpm build`: pnpm 10 non esegue gli script `pre*`, quindi come `prebuild` non
// girava mai e in produzione i file non c'erano affatto (2026-09-07).
//
// - `pdf.worker.min.mjs`: il worker.
// - `pdfjs-wasm/`: il decodificatore JBIG2 (wasm + ripiego JS). Senza di lui pdf.js 6
//   non rende le immagini JBIG2 e i QR dei biglietti Notorious — che sono proprio
//   JBIG2 — non si leggono mai (2026-09-07).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));

mkdirSync("public", { recursive: true });
copyFileSync(join(root, "build/pdf.worker.min.mjs"), join("public", "pdf.worker.min.mjs"));
console.log("[pdf.js] worker copiato in public/pdf.worker.min.mjs");

const wasmDir = join("public", "pdfjs-wasm");
mkdirSync(wasmDir, { recursive: true });
for (const f of ["jbig2.wasm", "jbig2_nowasm_fallback.js"]) {
  copyFileSync(join(root, "wasm", f), join(wasmDir, f));
}
console.log("[pdf.js] JBIG2 copiato in public/pdfjs-wasm/");

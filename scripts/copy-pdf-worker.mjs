// Copia il worker di pdf.js in public/ (gitignored) così il browser lo carica
// same-origin: la CSP consente solo script da 'self'. Girato da prebuild e predev.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve("pdfjs-dist/package.json")), "build/pdf.worker.min.mjs");
mkdirSync("public", { recursive: true });
copyFileSync(src, join("public", "pdf.worker.min.mjs"));
console.log("[pdf.js] worker copiato in public/pdf.worker.min.mjs");

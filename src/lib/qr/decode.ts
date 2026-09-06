// Lettura dei QR di un biglietto (screenshot, foto o PDF), tutta nel browser.
// Le immagini passano da un canvas a jsQR; i PDF vengono resi pagina per pagina da
// pdf.js (import dinamico: il bundle pesa solo quando serve). Nessun upload qui.

import jsQR from "jsqr";

export interface DecodedTicket {
  /** Payload dei QR trovati, distinti, nell'ordine di lettura. */
  codes: string[];
}

/** Al massimo 10 QR per biglietto, ognuno entro 2 KB (stessi limiti del server). */
const MAX_CODES = 10;
const MAX_CODE_LENGTH = 2048;
/** Lato lungo del canvas: 1600 px basta ai QR dei biglietti, 3200 al secondo tentativo. */
const BASE_SIDE = 1600;
const MAX_SIDE = 3200;
/** Pagine PDF esaminate (i biglietti stanno nelle prime). */
const PDF_PAGES = 3;
/** Più QR nella stessa immagine (due biglietti): dopo ogni lettura si copre l'area e si ripete. */
const PER_IMAGE = 4;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Legge fino a `PER_IMAGE` QR dal canvas, coprendo di bianco quelli già letti. */
function scanCanvas(canvas: HTMLCanvasElement, into: string[]): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  for (let i = 0; i < PER_IMAGE && into.length < MAX_CODES; i++) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hit = jsQR(img.data, img.width, img.height, {
      inversionAttempts: "attemptBoth",
    });
    if (!hit) return;
    const code = hit.data.trim().slice(0, MAX_CODE_LENGTH);
    if (code && !into.includes(code)) into.push(code);
    // copre il QR letto (bounding box dei quattro angoli) per cercarne un altro
    const loc = hit.location;
    const xs = [
      loc.topLeftCorner.x,
      loc.topRightCorner.x,
      loc.bottomLeftCorner.x,
      loc.bottomRightCorner.x,
    ];
    const ys = [
      loc.topLeftCorner.y,
      loc.topRightCorner.y,
      loc.bottomLeftCorner.y,
      loc.bottomRightCorner.y,
    ];
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x0 - 4, y0 - 4, Math.max(...xs) - x0 + 8, Math.max(...ys) - y0 + 8);
  }
}

function drawScaled(source: CanvasImageSource, w: number, h: number, side: number) {
  const k = Math.min(1, side / Math.max(w, h));
  const canvas = makeCanvas(w * k, h * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Prova alla scala base; senza risultati riprova a metà e al doppio (QR piccoli o enormi). */
function scanImage(
  source: CanvasImageSource,
  w: number,
  h: number,
  into: string[],
): void {
  const before = into.length;
  scanCanvas(drawScaled(source, w, h, BASE_SIDE), into);
  if (into.length > before) return;
  scanCanvas(drawScaled(source, w, h, BASE_SIDE / 2), into);
  if (into.length > before) return;
  scanCanvas(drawScaled(source, w, h, Math.min(MAX_SIDE, Math.max(w, h) * 2)), into);
}

async function decodeImage(file: File, into: string[]): Promise<void> {
  const bitmap = await createImageBitmap(file);
  try {
    scanImage(bitmap, bitmap.width, bitmap.height, into);
  } finally {
    bitmap.close();
  }
}

async function decodePdf(file: File, into: string[]): Promise<void> {
  const pdfjs = await import("pdfjs-dist");
  // Worker same-origin (CSP `script-src 'self'`): copiato in public/ da
  // scripts/copy-pdf-worker.mjs (prebuild/predev), non da `new URL(import.meta.url)`,
  // che fa crollare `next build` (TypeError anonimo dopo Serwist, 2026-09-06).
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  try {
    const pages = Math.min(PDF_PAGES, doc.numPages);
    for (let n = 1; n <= pages && into.length < MAX_CODES; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = makeCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      scanImage(canvas, canvas.width, canvas.height, into);
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
}

/**
 * Tutti i QR leggibili nel file (immagine o PDF). Non lancia per un file senza QR:
 * `codes` vuoto; lancia solo se il file non si apre affatto.
 */
export async function decodeTicket(file: File): Promise<DecodedTicket> {
  const codes: string[] = [];
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    await decodePdf(file, codes);
  } else {
    await decodeImage(file, codes);
  }
  return { codes: codes.slice(0, MAX_CODES) };
}

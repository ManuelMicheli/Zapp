import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tutte le route tranne asset statici, immagini, service worker e manifest.
     * Le API ci passano dentro (rispondono 401 senza sessione) e ognuna
     * ricontrolla comunque l'utente per conto suo: il middleware e' il primo
     * filtro, non l'unico.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|fonts|icons|pdf.worker.min.mjs|pdfjs-wasm|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};

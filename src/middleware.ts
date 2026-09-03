import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tutte le route tranne asset statici, immagini, service worker,
     * manifest e API TMDB (che verifica l'utente da sé).
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|fonts|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

/**
 * Percorsi che non richiedono una sessione utente.
 *
 * `/api/jobs` non è pubblico nel senso di "aperto a chiunque": ha una sua
 * autenticazione, più forte di quella a cookie — un segreto di 64 caratteri
 * confrontato in tempo costante, che sta nel Vault di Supabase. Deve stare qui perché
 * a chiamarlo è `pg_cron`, che una sessione non ce l'ha: senza questa riga il
 * middleware lo rimanda a `/login` e i job non girano mai, in silenzio.
 *
 * `/api/scrobble` ha lo stesso problema con un'autenticazione diversa: si
 * autentica col token del dispositivo (`Authorization: Bearer`), non col
 * cookie di sessione, quindi per il middleware e' sempre una richiesta
 * anonima. Senza questa riga anche il preflight `OPTIONS` tornava 307 verso
 * `/login` senza header CORS: il preflight falliva, la `fetch` dell'estensione
 * rigettava, e la coda cresceva fino a scartare — nessun errore visibile da
 * nessuna parte. L'autorizzazione della rotta resta il token, che valida da
 * se' (`src/app/api/scrobble/route.ts`).
 */
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/api/jobs", "/api/scrobble"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Non inserire logica tra createServerClient e getClaims: il refresh
  // del token dipende da questa chiamata. getClaims verifica la firma del JWT
  // in locale (chiavi ES256 del progetto, JWKS in cache): nessun viaggio verso
  // Supabase Auth a ogni navigazione.
  const { data: claims } = await supabase.auth.getClaims();
  const user = claims?.claims?.sub ? claims.claims : null;

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    // Le rotte API rispondono 401, non con un redirect: un fetch che si ritrova
    // l'HTML della pagina di login fallisce in modo poco chiaro (e la risposta
    // dice molto meno di un 401). `/api/jobs` e `/api/scrobble` non passano di
    // qui: sono pubblici e hanno la loro autenticazione a segreto/token.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Non autenticato" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

import { NextResponse, type NextRequest } from "next/server";
import { proxyGet } from "@/lib/tmdb/client";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

// Rotta legata alla sessione (verifica l'utente a ogni richiesta): niente cache
// condivisa. La cache vera sta davanti a TMDB, dentro `tmdbFetch`.
export const dynamic = "force-dynamic";

// Percorsi TMDB consentiti dal proxy (solo lettura, solo questi prefissi)
const ALLOWED = [
  /^search\/multi$/,
  /^trending\/(all|movie|tv)\/(day|week)$/,
  /^movie\/\d+(\/(watch\/providers|external_ids|credits|videos|recommendations))?$/,
  /^tv\/\d+(\/(watch\/providers|external_ids|credits|videos|recommendations))?$/,
  /^tv\/\d+\/season\/\d+$/,
  /^discover\/(movie|tv)$/,
  /^genre\/(movie|tv)\/list$/,
];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }
  // Nessuna pagina la usa oggi: resta l'unica porta prevista per il client, ma
  // con un tetto, perche' dietro c'e' la quota TMDB condivisa da tutta l'app.
  if (!(await rateLimit(`tmdbproxy:${user.id}`, 60, 60))) {
    return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  }

  const { path } = await context.params;
  const tmdbPath = path.join("/");

  if (!ALLOWED.some((re) => re.test(tmdbPath))) {
    return NextResponse.json({ error: "Percorso non consentito" }, { status: 400 });
  }

  // Elenco chiuso di parametri: `append_to_response` e simili farebbero fare a
  // TMDB (e pagare a noi, in quota) molto piu' lavoro di quanto la pagina chieda.
  const ALLOWED_PARAMS = new Set([
    "page",
    "query",
    "with_genres",
    "sort_by",
    "include_adult",
    "region",
    "year",
    "primary_release_year",
    "first_air_date_year",
    "vote_count.gte",
    "with_original_language",
    "with_watch_providers",
    "watch_region",
  ]);
  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    if (ALLOWED_PARAMS.has(key) && value.length <= 200) params[key] = value;
  });

  try {
    const data = await proxyGet(tmdbPath, params);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (error) {
    console.error("[api/tmdb] errore:", error);
    return NextResponse.json({ error: "Errore TMDB" }, { status: 502 });
  }
}

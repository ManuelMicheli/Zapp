import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/jobs/auth";
import { endRun, startRun } from "@/lib/jobs/runs";
import { createServiceClient } from "@/lib/supabase/server";
import type { TmdbVideos } from "@/lib/tmdb/types";
import { getOfficialTrailers } from "@/lib/trailers/official";
import { setSearchBudget } from "@/lib/trailers/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Quanti titoli guardare per giro. Con oEmbed, `videos.list` e le miniature delle bande
 * nere ognuno costa un paio di secondi: quindici stanno comodi nei 60 secondi della
 * funzione, e un giro all'ora copre il catalogo in una decina di giorni.
 */
const TITLES_PER_RUN = 15;
/**
 * Quante ricerche YouTube per giro. `search.list` costa 100 unità su 10.000 al giorno:
 * quattro per giro fanno 96 al giorno, appena sotto il tetto. Chi resta senza ricerca
 * non viene perso — o si accontenta del trailer inglese, o torna in coda al giro dopo.
 */
const SEARCHES_PER_RUN = 4;

/**
 * Riempie `title_trailers` un po' per volta, da solo.
 *
 * Chiamato ogni ora da `pg_cron` (`call_zapp_job('trailers')`). Prende dalla coda
 * `trailers_refresh_queue` i titoli più utili — prima quelli che qualcuno ha in
 * libreria — e per ognuno chiama `getOfficialTrailers`, cioè **la stessa funzione che
 * usa la scheda titolo**: stessa scala, stesse regole, stessa verifica che il video sia
 * di quel titolo. Qui non c'è nessuna logica sui trailer, solo il ritmo.
 */
async function run(): Promise<Record<string, unknown>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("trailers_refresh_queue", {
    want: TITLES_PER_RUN,
  });
  if (error) throw new Error(`coda dei trailer: ${error.message}`);

  const queue = (data ?? []) as { id: number; media_type: "movie" | "tv" }[];
  let withTrailer = 0;
  let empty = 0;
  setSearchBudget(SEARCHES_PER_RUN);
  try {
    for (const { id, media_type: mediaType } of queue) {
      const { data: title } = await supabase
        .from("titles")
        .select("title, original_title, release_date, raw")
        .eq("id", id)
        .eq("media_type", mediaType)
        .maybeSingle();
      if (!title) continue;

      const trailers = await getOfficialTrailers({
        videos: (title.raw as { videos?: TmdbVideos } | null)?.videos,
        titleId: id,
        mediaType,
        name: title.title,
        originalTitle: title.original_title,
        releaseDate: title.release_date,
      });
      if (trailers.length > 0) withTrailer += 1;
      else empty += 1;
    }
  } finally {
    // la lambda resta calda: senza questo, i render successivi non cercherebbero più
    setSearchBudget(Number.POSITIVE_INFINITY);
  }

  const { count } = await supabase
    .from("title_trailers")
    .select("title_id", { count: "exact", head: true });
  return { presi: queue.length, conTrailer: withTrailer, vuoti: empty, inCache: count };
}

export async function POST(request: Request) {
  if (!secretMatches(request.headers.get("x-jobs-secret"), process.env.JOBS_SECRET)) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }

  const apertura = await startRun("trailers");
  if (apertura.stato === "occupato") {
    return NextResponse.json({ error: "gia in corso" }, { status: 409 });
  }
  if (apertura.stato === "errore") {
    return NextResponse.json({ error: apertura.messaggio }, { status: 500 });
  }
  const id = apertura.id;

  try {
    const detail = await run();
    await endRun(id, true, detail);
    return NextResponse.json({ ok: true, ...detail });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await endRun(id, false, { error: message });
    console.error("[jobs] trailers fallito:", e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Comodo per lanciare il job a mano dal browser durante il collaudo. */
export const GET = POST;

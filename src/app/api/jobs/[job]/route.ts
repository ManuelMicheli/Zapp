import { NextResponse } from "next/server";
import { secretMatches } from "@/lib/jobs/auth";
import { endRun, startRun } from "@/lib/jobs/runs";
import { fetchNetflixItaly } from "@/lib/charts/netflix";
import { fetchProviderChart } from "@/lib/charts/justwatch";
import { chartSeasonNumber, cleanChartTitle } from "@/lib/charts/clean";
import { resolvePending, saveChart, type ChartInput } from "@/lib/charts/store";
import { fetchRatingsBatch, MdblistQuotaError } from "@/lib/ratings/mdblist";
import { saveRatings } from "@/lib/ratings/store";
import { createServiceClient } from "@/lib/supabase/server";
import { pruneEvents, refreshTasteBatch } from "@/lib/taste/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Id TMDB di Netflix: le righe di Tudum sono tutte sue. */
const NETFLIX_PROVIDER_ID = 8;
/** Quanti titoli risolvere per giro. */
const RESOLVE_PER_RUN = 40;
/** Quanti titoli aggiornare per giro: 5 lotti da 100. */
const RATINGS_PER_RUN = 500;
/** Quanti profili di gusto per giro: 200 × (1 RPC + 3 query) stanno nei 60 s. */
const TASTE_PER_RUN = 200;

type JobName =
  | "charts-netflix"
  | "charts-justwatch"
  | "charts-resolve"
  | "ratings-refresh"
  | "taste-refresh"
  | "events-prune";

const JOBS: Record<JobName, () => Promise<Record<string, unknown>>> = {
  "charts-netflix": async () => {
    const rows = await fetchNetflixItaly();
    if (rows.length === 0) return { written: 0, note: "nessuna riga IT" };
    const period = rows[0].week;
    const input: ChartInput[] = rows.map((r) => ({
      source: "netflix_tudum",
      providerId: NETFLIX_PROVIDER_ID,
      mediaType: r.category === "TV" ? "tv" : "movie",
      period,
      rank: r.rank,
      rawTitle: cleanChartTitle(r.showTitle, r.seasonTitle),
      rawSeason: r.seasonTitle,
      weeksInChart: r.weeksInTop10,
    }));
    // `saveChart` raggruppa da sé per fonte/provider/tipo/periodo: un'unica chiamata
    // basta anche con film e serie mescolati nello stesso array.
    const written = await saveChart(input);
    const seasons = rows.filter((r) => chartSeasonNumber(r.seasonTitle) !== null).length;
    return { period, written, seasons };
  },

  "charts-justwatch": async () => {
    // Netflix escluso: per lui abbiamo il dato ufficiale di Tudum
    const providers = [119, 337, 350];
    let written = 0;
    for (const providerId of providers) {
      for (const mediaType of ["movie", "tv"] as const) {
        written += await saveChart(await fetchProviderChart(providerId, mediaType));
      }
    }
    return { providers: providers.length, written };
  },

  "charts-resolve": async () => ({ resolved: await resolvePending(RESOLVE_PER_RUN) }),

  "ratings-refresh": async () => {
    const supabase = createServiceClient();
    // La coda con le priorità sta in SQL (`ratings_refresh_queue`, migration 0021):
    // prima i titoli in classifica, poi quelli in libreria di qualcuno, poi il resto.
    const { data, error } = await supabase.rpc("ratings_refresh_queue", {
      want: RATINGS_PER_RUN,
    });
    if (error) throw new Error(`coda dei voti: ${error.message}`);

    const wanted = (data ?? []) as { id: number; media_type: "movie" | "tv" }[];
    let written = 0;
    for (const mediaType of ["movie", "tv"] as const) {
      const ids = wanted.filter((t) => t.media_type === mediaType).map((t) => t.id);
      if (ids.length === 0) continue;
      const { found, answered } = await fetchRatingsBatch(ids, mediaType);
      written += await saveRatings(mediaType, found, answered);
    }
    return { asked: wanted.length, written };
  },

  "taste-refresh": async () => await refreshTasteBatch(TASTE_PER_RUN),

  "events-prune": async () => await pruneEvents(),
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ job: string }> },
) {
  const { job } = await params;
  if (!process.env.JOBS_SECRET) {
    // Distinto dal segreto sbagliato di proposito: senza questo log, un JOBS_SECRET
    // dimenticato su Vercel darebbe quattro job che rispondono 401 ogni giorno e una
    // `job_runs` vuota, cioè lo stesso quadro di un cron che non gira affatto
    console.error("[jobs] JOBS_SECRET non configurato: nessun job potrà mai partire");
  }
  if (!secretMatches(request.headers.get("x-jobs-secret"), process.env.JOBS_SECRET)) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const run = JOBS[job as JobName];
  if (!run) return NextResponse.json({ error: "job sconosciuto" }, { status: 404 });

  const apertura = await startRun(job);
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
    const quota = e instanceof MdblistQuotaError;
    await endRun(id, false, { error: message, quota });
    console.error(`[jobs] ${job} fallito:`, e);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * Comodo per lanciare un job a mano dal browser durante il collaudo, ma **solo
 * fuori produzione**: una GET che cambia stato e' la forma piu' facile da far
 * scattare per sbaglio (prefetch, crawler, ripetizione di una richiesta). In
 * produzione il job si lancia con una POST.
 */
export const GET =
  process.env.VERCEL_ENV === "production"
    ? async () => NextResponse.json({ error: "usa POST" }, { status: 405 })
    : POST;

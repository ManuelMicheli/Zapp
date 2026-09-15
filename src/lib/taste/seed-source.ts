import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { discoverByYears, discoverTopRated, getTrending } from "@/lib/tmdb/client";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import {
  finestraFormativa,
  pickSeedGrid,
  pickSeedGridForAge,
  type SeedCandidate,
  type SeedFonte,
} from "./seed";
import type { Json } from "@/types/database";

/** Quante righe di classifica leggere prima di filtrare e diversificare. */
const RIGHE_CLASSIFICA = 120;

interface RigaClassifica {
  rank: number;
  titles: {
    id: number;
    media_type: "movie" | "tv";
    title: string;
    poster_path: string | null;
    genres: Json | null;
    release_date: string | null;
  } | null;
}

/** `"1994-09-23"` → `1994`. Qualunque cosa storta vale quanto un anno mancante. */
function annoDi(data: string | null | undefined): number | null {
  if (!data) return null;
  const anno = Number(data.slice(0, 4));
  return Number.isInteger(anno) && anno > 1800 ? anno : null;
}

/** Le pagine di TMDB hanno tutte la stessa forma: un solo posto dove tradurle. */
function daTmdb(
  risultati: TmdbMultiResult[] | undefined,
  fonte: SeedFonte,
): SeedCandidate[] {
  const out: SeedCandidate[] = [];
  for (const t of risultati ?? []) {
    if (t.media_type !== "movie" && t.media_type !== "tv") continue;
    if (!t.poster_path) continue;
    const nome = "title" in t ? t.title : t.name;
    out.push({
      id: t.id,
      mediaType: t.media_type,
      title: nome ?? "",
      posterPath: t.poster_path,
      genreIds: Array.isArray(t.genre_ids) ? t.genre_ids : [],
      fonte,
      rank: null,
      // stessa scala dello ZappScore, che è 0-10 e non 0-100
      score: typeof t.vote_average === "number" ? t.vote_average : null,
      year: annoDi(t.media_type === "movie" ? t.release_date : t.first_air_date),
    });
  }
  return out;
}

function generiDi(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => (g && typeof g === "object" ? (g as { id?: unknown }).id : null))
    .filter((id): id is number => typeof id === "number");
}

/**
 * Il **pool** di candidati per la griglia dell'onboarding: grezzo, non ancora scelto.
 * A ridurlo a griglia sono `getSeedGrid` (prima di conoscere l'età) e
 * `getSeedGridForAge` (dopo), che partono dallo stesso pool e lo pagano una volta
 * sola grazie a `cache`.
 *
 * Nessuna chiamata nuova a servizi esterni: le classifiche stanno già in
 * `title_charts` (fase B) e il trending è la stessa `fetch` che usa Scopri, quindi ne
 * condivide la cache Next da un'ora. Se entrambe le fonti mancassero, il pool torna
 * vuoto e il passo 2 dell'onboarding **non compare**: meglio un passo in meno che una
 * schermata rotta davanti a chi apre Zapp per la prima volta.
 *
 * Il join usa l'hint FK esplicito `titles!title_charts_title_fkey`: la chiave è
 * composita (`title_id, media_type`) e PostgREST non la deduce — un hint implicito
 * darebbe 400 e una griglia vuota in silenzio.
 */
export const getSeedCandidates = cache(async (): Promise<SeedCandidate[]> => {
  const supabase = await createClient();

  const [classifiche, trending, classiciFilm, classiciSerie] = await Promise.all([
    supabase
      .from("title_charts")
      .select(
        "rank, titles!title_charts_title_fkey(id, media_type, title, poster_path, genres, release_date)",
      )
      .eq("country", "IT")
      .not("title_id", "is", null)
      .order("period", { ascending: false })
      .limit(RIGHE_CLASSIFICA),
    getTrending().catch(() => null),
    // I più amati di sempre: sono questi a far capire un gusto, non le novità.
    discoverTopRated("movie").catch(() => null),
    discoverTopRated("tv").catch(() => null),
  ]);

  if (classifiche.error) {
    console.error("[seed] classifiche non lette:", classifiche.error.message);
  }

  const candidati: SeedCandidate[] = [];
  const punteggi = new Map<string, number | null>();

  const righe = (classifiche.data ?? []) as unknown as RigaClassifica[];
  for (const r of righe) {
    const t = r.titles;
    if (!t?.poster_path) continue;
    candidati.push({
      id: t.id,
      mediaType: t.media_type,
      title: t.title,
      posterPath: t.poster_path,
      genreIds: generiDi(t.genres),
      fonte: "classifica",
      rank: r.rank,
      score: null,
      year: annoDi(t.release_date),
    });
  }

  // Lo ZappScore in una seconda query, indicizzato per chiave composita: il join
  // diretto su `title_ratings` avrebbe la stessa ambiguità di chiave del punto sopra.
  const ids = candidati.map((c) => c.id);
  if (ids.length > 0) {
    const { data } = await supabase
      .from("title_ratings")
      .select("title_id, media_type, zapp_score")
      .in("title_id", ids);
    for (const r of data ?? []) {
      punteggi.set(
        `${r.media_type}-${r.title_id}`,
        r.zapp_score === null ? null : Number(r.zapp_score),
      );
    }
    for (const c of candidati) {
      c.score = punteggi.get(`${c.mediaType}-${c.id}`) ?? null;
    }
  }

  // I classici per primi nell'elenco: `pickSeedGrid` li ordina comunque per fonte, ma
  // così la deduplicazione tiene la loro riga, che è quella meglio etichettata.
  candidati.push(...daTmdb(classiciFilm?.results, "classico"));
  candidati.push(...daTmdb(classiciSerie?.results, "classico"));
  candidati.push(...daTmdb(trending?.results, "tendenza"));

  return candidati;
});

/** La griglia com'era prima di conoscere l'età: la prima che l'onboarding mostra. */
export const getSeedGrid = cache(async (): Promise<SeedCandidate[]> => {
  return pickSeedGrid(await getSeedCandidates());
});

/**
 * Di quanto si arrotonda la finestra formativa. Cinque anni: due coetanei chiedono a
 * TMDB la stessa cosa e si passano la cache, invece di una chiave per anno di nascita.
 */
const PASSO_FINESTRA = 5;

const arrotonda = (anno: number) => Math.floor(anno / PASSO_FINESTRA) * PASSO_FINESTRA;

/**
 * La griglia tarata sull'anno di nascita: il pool di sempre **più** i titoli più
 * amati usciti nei suoi anni formativi.
 *
 * Le due chiamate in più sono in cache da 24 ore e arrotondate al quinquennio, quindi
 * costano una volta sola per fascia d'età, non una per iscritto. Se cadono, resta il
 * pool di base: il passo 2 non si rompe mai per una chiamata andata storta.
 */
export async function getSeedGridForAge(birthYear: number): Promise<SeedCandidate[]> {
  // Si arrotonda **l'anno di nascita**, non la finestra: così la finestra che si
  // chiede a TMDB e quella con cui si filtra sono la stessa: arrotondando la finestra
  // si chiedevano vent'anni di titoli per poi buttarne quattro, ed erano i più votati.
  const fascia = arrotonda(birthYear);
  const { da, a } = finestraFormativa(fascia);

  const [base, epocaFilm, epocaSerie] = await Promise.all([
    getSeedCandidates(),
    discoverByYears("movie", da, a).catch(() => null),
    discoverByYears("tv", da, a).catch(() => null),
  ]);

  return pickSeedGridForAge(
    [
      ...base,
      ...daTmdb(epocaFilm?.results, "epoca"),
      ...daTmdb(epocaSerie?.results, "epoca"),
    ],
    fascia,
  );
}

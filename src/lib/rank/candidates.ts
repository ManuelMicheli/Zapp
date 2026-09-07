import "server-only";

import { discoverByGenre, discoverNewOnStreaming } from "@/lib/tmdb/client";
import { searchResultTitle, searchResultYear } from "@/lib/tmdb/mappers";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import { genreIdsFor } from "@/lib/home/hero-rank";
import { consigliabile } from "./filters";
import { getSocialSignals } from "./social";
import type { Db, MediaType, RankCandidate, RankContext } from "./types";
import type { TasteVector } from "./vector";

/**
 * Da dove vengono i titoli che il motore ordina.
 *
 * Tutte le fonti sono **già pagate da altre parti dell'app**: classifiche e voti stanno
 * in DB dalla fase B, e le due `discover` sono le stesse `fetch` del carosello e degli
 * scaffali (cache Next 1 h). Questa fase non aggiunge una sola chiamata esterna nuova a
 * un render della home.
 *
 * Il client Supabase, la libreria dell'utente e i generi di ripiego arrivano **come
 * parametri** e non da `getViewer()`: così il motore gira anche fuori da una richiesta
 * HTTP, che è l'unico modo di collaudarlo davvero da riga di comando (vedi
 * `scripts/rank-dump.ts`).
 */

/** Quanti generi e provider del profilo interrogare. */
const GENERI_DI_TESTA = 3;
const PROVIDER_DI_TESTA = 2;
/**
 * L'asticella dei candidati, alzata dopo aver letto le liste vere (2026-09-07): con la
 * soglia dei simili (50 voti) i consigli si riempivano di uscite recenti di poco conto
 * — "I Want Your Sex", "Hotel Desire", "À 14 ans" — che `sort_by=popularity.desc`
 * porta in cima solo perché sono di questa settimana. Un consiglio è un titolo che
 * qualcuno ha già visto e apprezzato, non una novità qualsiasi.
 */
const SOGLIE: Record<MediaType, { voti: number; voto: number }> = {
  movie: { voti: 300, voto: 6 },
  tv: { voti: 100, voto: 6.5 },
};
/** Per quanti candidati vale la pena chiedere regista e cast. */
const CON_PERSONE = 60;
/** Quanti titoli pescare dalla classifica dei meglio votati su Zapp. */
const DAL_DATABASE = 120;

/** Le chiavi più alte di una mappa del vettore. */
function testa(mappa: Map<string, number>, quante: number): number[] {
  return [...mappa.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, quante)
    .map(([k]) => Number(k))
    .filter((n) => Number.isFinite(n));
}

function daTmdb(
  results: TmdbMultiResult[] | undefined,
  type: MediaType,
): RankCandidate[] {
  return (results ?? [])
    .filter((r) => r.media_type === type)
    .filter((r) => r.poster_path)
    .map((r) => ({
      id: r.id,
      mediaType: type,
      title: searchResultTitle(r),
      posterPath: r.poster_path as string,
      year: searchResultYear(r),
      genreIds: r.genre_ids ?? [],
      runtime: null,
      originalLanguage: null,
      providerIds: [],
      people: [],
      zappScore: null,
      voteAverage: r.vote_average ?? null,
      voteCount: r.vote_count ?? null,
      friends: null,
    }));
}

function chiave(c: { id: number; mediaType: MediaType }): string {
  return `${c.mediaType}-${c.id}`;
}

function generiDi(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => (g && typeof g === "object" ? (g as { id?: unknown }).id : null))
    .filter((id): id is number => typeof id === "number");
}

/**
 * I candidati per un tipo, già ripuliti: niente libreria, niente titoli con troppi
 * pochi voti, niente doppioni.
 */
export async function getCandidates(
  type: MediaType,
  vector: TasteVector,
  ctx: RankContext,
): Promise<RankCandidate[]> {
  // I generi di testa vengono dal profilo della fase A; se è ancora vuoto si ricade su
  // quelli dedotti dalla libreria, che è ciò che la home usava prima di questa fase.
  const dalProfilo = testa(vector.generi, GENERI_DI_TESTA);
  const generi = genreIdsFor(
    type,
    dalProfilo.length > 0 ? dalProfilo : ctx.generiDiRipiego,
  );
  const provider = testa(vector.provider, PROVIDER_DI_TESTA);

  const [perGenere, novita, classifiche, sociale] = await Promise.all([
    Promise.all(
      generi.map((g) =>
        discoverByGenre(type, g, 1, {
          scriptedOnly: true,
          minVotes: SOGLIE[type].voti,
          minScore: SOGLIE[type].voto,
        }).catch(() => null),
      ),
    ),
    provider.length > 0
      ? discoverNewOnStreaming(type, provider).catch(() => null)
      : Promise.resolve(null),
    candidatiDalDatabase(type, ctx.db),
    getSocialSignals(ctx.db, ctx.userId),
  ]);

  const tutti: RankCandidate[] = [
    // Gli amici per primi: se un titolo arriva da più fonti, la riga che porta il
    // segnale sociale è quella che vince la deduplicazione.
    ...sociale.candidati.filter((c) => c.mediaType === type),
    ...classifiche,
    ...perGenere.flatMap((p) => daTmdb(p?.results, type)),
    ...daTmdb(novita?.results, type),
  ];

  const visti = new Set<string>();
  const puliti: RankCandidate[] = [];
  for (const c of tutti) {
    const k = chiave(c);
    if (visti.has(k) || ctx.inLibreria.has(k)) continue;
    if (!consigliabile(c)) continue;
    // I candidati che arrivano dal database non portano il conteggio dei voti (hanno
    // già lo ZappScore, che è più severo): la soglia vale solo per quelli di TMDB.
    // E un titolo che un amico ha finito e votato bene non deve passare quell'esame
    // affatto: se è piaciuto a un amico, quanti voti abbia altrove non conta più.
    const daAmici = c.friends !== null;
    const voti = c.voteCount ?? 0;
    if (!daAmici && voti > 0 && voti < SOGLIE[type].voti) continue;
    if (
      !daAmici &&
      c.voteAverage !== null &&
      c.voteAverage > 0 &&
      c.voteAverage < SOGLIE[type].voto
    ) {
      continue;
    }
    visti.add(k);
    puliti.push({ ...c, friends: c.friends ?? sociale.segnali.get(k) ?? null });
  }

  return arricchisci(puliti, ctx.db);
}

/**
 * I titoli che stanno già in casa: i meglio votati su Zapp della fase B. Nessuna
 * chiamata esterna, e arrivano con lo ZappScore già dentro.
 */
async function candidatiDalDatabase(type: MediaType, db: Db): Promise<RankCandidate[]> {
  const { data, error } = await db
    .from("title_ratings")
    .select(
      "zapp_score, titles!title_ratings_title_fkey!inner(id, media_type, title, poster_path, release_date, runtime, genres)",
    )
    .eq("media_type", type)
    .not("zapp_score", "is", null)
    .order("zapp_score", { ascending: false })
    .limit(DAL_DATABASE);

  if (error) {
    // Uno scaffale vuoto per un errore è identico a uno scaffale vuoto per mancanza di
    // dati: senza questa riga i due casi non si distinguono più.
    console.error("[rank] candidati dal database non letti:", error.message);
    return [];
  }

  const out: RankCandidate[] = [];
  for (const r of (data ?? []) as unknown as {
    zapp_score: number | null;
    titles: {
      id: number;
      media_type: MediaType;
      title: string;
      poster_path: string | null;
      release_date: string | null;
      runtime: number | null;
      genres: unknown;
    } | null;
  }[]) {
    const t = r.titles;
    if (!t?.poster_path) continue;
    out.push({
      id: t.id,
      mediaType: t.media_type,
      title: t.title,
      posterPath: t.poster_path,
      year: t.release_date ? t.release_date.slice(0, 4) : null,
      genreIds: generiDi(t.genres),
      runtime: t.runtime,
      originalLanguage: null,
      providerIds: [],
      people: [],
      zappScore: r.zapp_score === null ? null : Number(r.zapp_score),
      voteAverage: null,
      voteCount: null,
      friends: null,
    });
  }
  return out;
}

/**
 * Riempie ciò che manca ai candidati arrivati da TMDB: ZappScore, durata, anno e le
 * piattaforme dove si vede.
 *
 * Regista e cast si chiedono solo per i primi `CON_PERSONE` e con la RPC
 * `title_people` (migration 0026), che apre `titles.raw` **dentro Postgres**: sul filo
 * passano i nomi, non i 27 KB per riga.
 */
async function arricchisci(candidati: RankCandidate[], db: Db): Promise<RankCandidate[]> {
  if (candidati.length === 0) return candidati;
  const ids = [...new Set(candidati.map((c) => c.id))];

  const [voti, offerte, dettagli, persone] = await Promise.all([
    db
      .from("title_ratings")
      .select("title_id, media_type, zapp_score")
      .in("title_id", ids),
    db
      .from("title_providers")
      .select("title_id, media_type, provider_id")
      .in("title_id", ids)
      .eq("kind", "flatrate"),
    db.from("titles").select("id, media_type, runtime, release_date").in("id", ids),
    db.rpc("title_people", { ids: ids.slice(0, CON_PERSONE) }),
  ]);

  const voto = new Map<string, number | null>();
  for (const r of (voti.data ?? []) as {
    title_id: number;
    media_type: MediaType;
    zapp_score: number | null;
  }[]) {
    voto.set(`${r.media_type}-${r.title_id}`, r.zapp_score);
  }

  const offerta = new Map<string, number[]>();
  for (const r of (offerte.data ?? []) as {
    title_id: number;
    media_type: MediaType;
    provider_id: number;
  }[]) {
    const k = `${r.media_type}-${r.title_id}`;
    const elenco = offerta.get(k);
    if (elenco) elenco.push(r.provider_id);
    else offerta.set(k, [r.provider_id]);
  }

  const dettaglio = new Map<
    string,
    { runtime: number | null; release_date: string | null }
  >();
  for (const r of (dettagli.data ?? []) as {
    id: number;
    media_type: MediaType;
    runtime: number | null;
    release_date: string | null;
  }[]) {
    dettaglio.set(`${r.media_type}-${r.id}`, r);
  }

  const nomi = new Map<string, string[]>();
  for (const r of (persone.data ?? []) as {
    title_id: number;
    media_type: MediaType;
    people: string[] | null;
  }[]) {
    nomi.set(`${r.media_type}-${r.title_id}`, r.people ?? []);
  }

  return candidati.map((c) => {
    const k = chiave(c);
    const d = dettaglio.get(k);
    const punteggio = voto.get(k);
    return {
      ...c,
      zappScore:
        c.zappScore ??
        (punteggio === undefined || punteggio === null ? null : Number(punteggio)),
      runtime: c.runtime ?? d?.runtime ?? null,
      year: c.year ?? d?.release_date?.slice(0, 4) ?? null,
      providerIds: offerta.get(k) ?? [],
      people: nomi.get(k) ?? [],
    };
  });
}

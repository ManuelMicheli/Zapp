import "server-only";

import {
  discoverByGenre,
  discoverByPerson,
  discoverNewOnStreaming,
} from "@/lib/tmdb/client";
import { genreIdsFor } from "@/lib/home/hero-rank";
import { HOME_SCOPE_VUOTO, inGenre, scopeVuoto } from "@/lib/home/scope";
import { offreLaPiattaforma } from "@/lib/platforms/filter";
import { freschezzaDi, passaIlPavimento, PAVIMENTO_VOTI } from "./fame";
import { consigliabile } from "./filters";
import { candidatiDaTmdb } from "./from-tmdb";
import { candidatiDelloScope } from "./scoped";
import { getSocialSignals } from "./social";
import type {
  CandidateOptions,
  Db,
  InChart,
  MediaType,
  RankCandidate,
  RankContext,
} from "./types";
import type { TasteVector } from "./vector";

/**
 * Da dove vengono i titoli che il motore ordina.
 *
 * Sei sorgenti, **tutte già pagate da altre parti dell'app**: voti e classifiche stanno
 * in DB dalla fase B, le `discover` sono le stesse `fetch` del carosello e degli
 * scaffali (cache Next 1 h). Questa fase non aggiunge una chiamata esterna nuova a un
 * render della home.
 *
 * Il client Supabase, la libreria dell'utente, i preferiti e i generi di ripiego
 * arrivano **come parametri** e non da `getViewer()`: così il motore gira anche fuori da
 * una richiesta HTTP, che è l'unico modo di collaudarlo davvero da riga di comando
 * (`scripts/rank-dump.ts`).
 */

/** Quanti generi e provider del profilo interrogare. */
const GENERI_DI_TESTA = 3;
const PROVIDER_DI_TESTA = 2;
/** Quante persone preferite meritano una `discover` loro. */
const PERSONE_DI_TESTA = 2;
/** Quante pagine di `discover` per ogni genere del profilo. */
const PAGINE_PER_GENERE = 2;

/**
 * L'asticella chiesta a TMDB, allineata al pavimento della fama (`PAVIMENTO_VOTI`).
 *
 * La vecchia (300 film / 100 serie) non escludeva niente di ciò che disturbava:
 * trecento voti su TMDB è un film che non conosce nessuno, e `sort_by=popularity.desc`
 * ne porta in cima a manciate solo perché sono di questa settimana. Chiedere il filtro a
 * TMDB invece di applicarlo dopo è anche l'unico modo di non svuotare la pagina.
 */
const SOGLIE: Record<MediaType, { voti: number; voto: number }> = {
  movie: { voti: PAVIMENTO_VOTI.movie, voto: 6 },
  tv: { voti: PAVIMENTO_VOTI.tv, voto: 6.5 },
};

/**
 * Le soglie delle novità, più basse: una novità per definizione non ha ancora
 * accumulato voti. Chi non arriva nemmeno a queste entra comunque se sta in classifica
 * — che per una novità è la misura giusta.
 */
const SOGLIE_NOVITA: Record<MediaType, number> = { movie: 200, tv: 50 };

/** Per quanti candidati vale la pena chiedere regista e cast. */
const CON_PERSONE = 60;
/** Quanto a fondo si legge la classifica per ZappScore, e quanti se ne tengono. */
const CLASSICI_FONDO = 500;
const CLASSICI_PRESI = 140;
/** Quanti classici restano in testa senza mai ruotare: la vetta del catalogo. */
const CLASSICI_VETTA = 20;

/** Le chiavi più alte di una mappa del vettore. */
function testa(mappa: Map<string, number>, quante: number): number[] {
  return [...mappa.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, quante)
    .map(([k]) => Number(k))
    .filter((n) => Number.isFinite(n));
}

/**
 * Un risultato TMDB come lo vuole il motore: sta in `from-tmdb.ts` (senza `server-only`)
 * e da qui si ri-esporta per la fila del momento (`src/lib/moment/shelf.ts`), che pesca
 * da `discover` esattamente come questo modulo.
 */
export { candidatiDaTmdb } from "./from-tmdb";

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
 * Mescolamento deterministico: la stessa lista, lo stesso utente e lo stesso giorno
 * danno sempre lo stesso ordine, ma domani è un altro.
 *
 * Serve ai classici, l'unica sorgente il cui ordine non dipende da niente di personale:
 * senza rotazione i titoli col miglior ZappScore erano gli stessi per tutti e gli stessi
 * ogni giorno, e la parte della home che doveva dire "ecco i capolavori che ti mancano"
 * smetteva di dirlo dopo una settimana.
 */
export function ruota<T>(lista: readonly T[], seme: number): T[] {
  const out = [...lista];
  // xorshift32: nessuna dipendenza, e a parità di seme dà sempre la stessa sequenza.
  let stato = seme >>> 0 || 1;
  const prossimo = () => {
    stato ^= stato << 13;
    stato ^= stato >>> 17;
    stato ^= stato << 5;
    return (stato >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(prossimo() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * I candidati per un tipo, già ripuliti: niente libreria, niente titoli che non ha visto
 * nessuno, niente doppioni, e la stanchezza applicata.
 *
 * Con un **ambito** (`options.scope`: la home filtrata per genere e/o piattaforma) le
 * `discover` del profilo lasciano il posto a quelle dell'ambito
 * (`candidatiDelloScope`), mentre classifiche, classici e amici restano e vengono
 * verificati dopo `arricchisci`.
 */
export async function getCandidates(
  type: MediaType,
  vector: TasteVector,
  ctx: RankContext,
  options: CandidateOptions = {},
): Promise<RankCandidate[]> {
  const scope = options.scope ?? HOME_SCOPE_VUOTO;
  const filtrata = !scopeVuoto(scope);

  // I generi di testa vengono dal profilo della fase A; se è ancora vuoto si ricade su
  // quelli dedotti dalla libreria, che è ciò che la home usava prima di questa fase.
  const dalProfilo = testa(vector.generi, GENERI_DI_TESTA);
  const generi = genreIdsFor(
    type,
    dalProfilo.length > 0 ? dalProfilo : ctx.generiDiRipiego,
  );
  const provider = testa(vector.provider, PROVIDER_DI_TESTA);
  const persone = [...ctx.preferiti].slice(0, PERSONE_DI_TESTA);

  const [perGenere, novita, classici, inVoga, daPersone, sociale, ambito] =
    await Promise.all([
      filtrata
        ? Promise.resolve([])
        : Promise.all(
            generi.flatMap((g) =>
              Array.from({ length: PAGINE_PER_GENERE }, (_, i) =>
                discoverByGenre(type, g, i + 1, {
                  scriptedOnly: true,
                  minVotes: SOGLIE[type].voti,
                  minScore: SOGLIE[type].voto,
                }).catch(() => null),
              ),
            ),
          ),
      !filtrata && provider.length > 0
        ? discoverNewOnStreaming(type, provider, {
            sortByPopularity: true,
            minVotes: SOGLIE_NOVITA[type],
          }).catch(() => null)
        : Promise.resolve(null),
      classiciDalDatabase(type, ctx),
      inClassifica(type, ctx.db),
      filtrata || persone.length === 0
        ? Promise.resolve([])
        : Promise.all(
            persone.map((p) =>
              discoverByPerson(type, p, { minVotes: SOGLIE[type].voti }).catch(
                () => null,
              ),
            ),
          ),
      options.includeSocial === false
        ? Promise.resolve({ segnali: new Map(), candidati: [] })
        : getSocialSignals(ctx.db, ctx.userId),
      filtrata ? candidatiDelloScope(type, scope, generi) : Promise.resolve(null),
    ]);

  const certi = new Set<string>([
    ...(ambito?.certiGenere ?? []),
    ...(ambito?.certiPiattaforma ?? []),
  ]);

  // La posizione in classifica non è solo una sorgente: è un dato che vale per
  // **qualunque** candidato, da qualunque parte arrivi. Un titolo pescato da `discover`
  // che sta anche in Top 10 deve portarsi dietro il suo `inChart`, altrimenti la fama
  // dipenderebbe da quale sorgente lo ha trovato per prima.
  const classifica = new Map<string, InChart>();
  for (const c of inVoga) {
    if (c.inChart) classifica.set(chiave(c), c.inChart);
  }

  const tutti: RankCandidate[] = [
    // Gli amici per primi: se un titolo arriva da più fonti, la riga che porta il
    // segnale sociale è quella che vince la deduplicazione.
    ...sociale.candidati.filter((c) => c.mediaType === type),
    ...inVoga,
    ...classici,
    ...perGenere.flatMap((p) => candidatiDaTmdb(p?.results, type)),
    ...daPersone.flatMap((p) => candidatiDaTmdb(p?.results, type)),
    ...candidatiDaTmdb(novita?.results, type),
    ...(ambito?.candidati ?? []),
  ];

  const visti = new Set<string>();
  const puliti: RankCandidate[] = [];
  for (const c of tutti) {
    const k = chiave(c);
    if (visti.has(k) || ctx.inLibreria.has(k)) continue;
    if (!consigliabile(c)) continue;

    const conSegnali: RankCandidate = {
      ...c,
      inChart: c.inChart ?? classifica.get(k) ?? null,
      friends: c.friends ?? sociale.segnali.get(k) ?? null,
      freschezza: freschezzaDi(ctx.mostratiSenzaApertura.get(k)),
    };

    // Chi ha stancato per davvero non entra: `freschezzaDi` torna 0 dalla sesta
    // sessione in cui la copertina è passata davanti senza un tocco.
    if (conSegnali.freschezza <= 0) continue;

    // Il pavimento della fama, con le sue tre esenzioni (classifica, amici, persone
    // preferite). I titoli che l'ambito ha portato lui sono esenti a loro volta: la
    // soglia giusta l'ha già messa il `discover` che li ha chiesti.
    const esente = certi.has(k);
    if (!esente && !passaIlPavimento(conSegnali, ctx.preferiti)) continue;
    if (
      !esente &&
      !conSegnali.inChart &&
      conSegnali.voteAverage !== null &&
      conSegnali.voteAverage > 0 &&
      conSegnali.voteAverage < SOGLIE[type].voto
    ) {
      continue;
    }

    visti.add(k);
    puliti.push(conSegnali);
  }

  const arricchiti = await arricchisci(puliti, ctx.db);
  if (!ambito) return arricchiti;

  // La verifica dell'ambito, dopo `arricchisci` perché è lì che arrivano le offerte.
  return arricchiti.flatMap((c) => {
    const k = chiave(c);
    const offerta =
      scope.platforms.length > 0
        ? offreLaPiattaforma(c.providerIds, scope.platforms)
        : true;
    const suPiattaforma =
      scope.platforms.length === 0 || ambito.certiPiattaforma.has(k) || offerta;
    const nelGenere =
      !scope.genre || ambito.certiGenere.has(k) || inGenre(scope.genre, c) === true;
    if (!suPiattaforma || !nelGenere) return [];
    // Certo per la piattaforma ma senza offerta in cache: l'affinità sulla dimensione
    // `provider` deve comunque vederla.
    if (scope.platforms.length > 0 && !offerta) {
      return [
        {
          ...c,
          providerIds: [...c.providerIds, ...scope.platforms.map((p) => p.providerId)],
        },
      ];
    }
    return [c];
  });
}

/** Le colonne di `titles` che servono a un candidato: mai `raw`. */
const COLONNE_TITOLO =
  "id, media_type, title, poster_path, backdrop_path, overview, release_date, runtime, genres, vote_average, vote_count";

interface RigaTitolo {
  id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string | null;
  release_date: string | null;
  runtime: number | null;
  genres: unknown;
  vote_average: number | null;
  vote_count: number | null;
}

function daRigaTitolo(t: RigaTitolo, zappScore: number | null): RankCandidate | null {
  if (!t.poster_path) return null;
  return {
    id: t.id,
    mediaType: t.media_type,
    title: t.title,
    posterPath: t.poster_path,
    backdropPath: t.backdrop_path,
    overview: t.overview?.trim() || null,
    year: t.release_date ? t.release_date.slice(0, 4) : null,
    genreIds: generiDi(t.genres),
    runtime: t.runtime,
    originalLanguage: null,
    providerIds: [],
    people: [],
    zappScore,
    voteAverage: t.vote_average === null ? null : Number(t.vote_average),
    voteCount: t.vote_count,
    inChart: null,
    freschezza: 1,
    friends: null,
  };
}

/**
 * I grandi classici: i titoli col miglior ZappScore, che stanno già in casa (fase B).
 *
 * Si legge a fondo (`CLASSICI_FONDO`) e se ne tengono `CLASSICI_PRESI`, **ruotati sul
 * seme dell'utente e del giorno** tranne la vetta. Fino al 2026-09-15 erano i 120 in
 * cima, sempre gli stessi per tutti e sempre gli stessi ogni giorno.
 *
 * `confidence: high` tiene fuori i titoli con due voti in croce, e i voti TMDB si
 * leggono qui perché senza `vote_count` la fama di un candidato del database sarebbe
 * neutra — cioè un classico da trentamila voti peserebbe come un film mai visto.
 */
async function classiciDalDatabase(
  type: MediaType,
  ctx: RankContext,
): Promise<RankCandidate[]> {
  const { data, error } = await ctx.db
    .from("title_ratings")
    .select(`zapp_score, titles!title_ratings_title_fkey!inner(${COLONNE_TITOLO})`)
    .eq("media_type", type)
    .eq("confidence", "high")
    .not("zapp_score", "is", null)
    .order("zapp_score", { ascending: false })
    .limit(CLASSICI_FONDO);

  if (error) {
    // Uno scaffale vuoto per un errore è identico a uno scaffale vuoto per mancanza di
    // dati: senza questa riga i due casi non si distinguono più.
    console.error("[rank] classici non letti:", error.message);
    return [];
  }

  const out: RankCandidate[] = [];
  for (const r of (data ?? []) as unknown as {
    zapp_score: number | null;
    titles: RigaTitolo | null;
  }[]) {
    if (!r.titles) continue;
    const c = daRigaTitolo(r.titles, r.zapp_score === null ? null : Number(r.zapp_score));
    if (c) out.push(c);
  }
  // Si ruota la coda, non la vetta: i titoli col punteggio più alto del catalogo
  // meritano di poter esserci sempre.
  const vetta = out.slice(0, CLASSICI_VETTA);
  const coda = ruota(out.slice(CLASSICI_VETTA), ctx.seme);
  return [...vetta, ...coda].slice(0, CLASSICI_PRESI);
}

/**
 * Quello che l'Italia sta guardando adesso: `title_charts` nella finestra corrente.
 *
 * Fino al 2026-09-15 le classifiche alimentavano una fila a sé e **mai** il motore: la
 * metà "in voga del momento" dei consigli non esisteva. Sono anche l'unica sorgente che
 * sa qualcosa che i voti TMDB non sanno — una serie uscita martedì e vista da mezza
 * Italia ha duecento voti — e per questo `inChart` alza la fama e salta il pavimento.
 *
 * La finestra la decide la vista `chart_periodi_correnti` (migration 0059), non un
 * numero di giorni scritto a mano: Netflix è settimanale e in ritardo di ~15 giorni,
 * JustWatch è quotidiano, e nessuna finestra unica concilia le due cadenze.
 */
async function inClassifica(type: MediaType, db: Db): Promise<RankCandidate[]> {
  const periodi = await db
    .from("chart_periodi_correnti")
    .select("period")
    .eq("country", "IT");
  if (periodi.error) {
    console.error("[rank] periodi correnti non letti:", periodi.error.message);
    return [];
  }
  const finestra = [
    ...new Set(
      (periodi.data ?? []).map((r) => r.period).filter((p): p is string => p != null),
    ),
  ];
  if (finestra.length === 0) return [];

  const { data, error } = await db
    .from("title_charts")
    // Il nome esplicito del vincolo non è pignoleria: la FK fra `title_charts` e
    // `titles` è composita (title_id, media_type), PostgREST non la deduce, e un hint
    // implicito risponde 400 — cioè uno scaffale vuoto senza un errore in pagina.
    .select(
      `rank, source, provider_id, titles!title_charts_title_fkey!inner(${COLONNE_TITOLO})`,
    )
    .eq("country", "IT")
    .eq("media_type", type)
    .in("period", finestra)
    .not("title_id", "is", null)
    .order("rank", { ascending: true })
    // Il limite si ricava dalla finestra, non da una costante: una classifica è 20
    // righe e le coppie (fonte, provider) sono quelle. Un numero scritto a mano diventa
    // stretto il giorno in cui si aggiunge un provider e tronca in silenzio — è già
    // successo, vedi `finestraCorrente` in `src/lib/charts/queries.ts`.
    .limit(finestra.length * 20);

  if (error) {
    console.error("[rank] classifiche non lette:", error.message);
    return [];
  }

  const out: RankCandidate[] = [];
  const visti = new Set<string>();
  for (const r of (data ?? []) as unknown as {
    rank: number;
    source: string;
    provider_id: number;
    titles: RigaTitolo | null;
  }[]) {
    if (!r.titles) continue;
    const k = `${r.titles.media_type}-${r.titles.id}`;
    if (visti.has(k)) continue;
    const c = daRigaTitolo(r.titles, null);
    if (!c) continue;
    visti.add(k);
    out.push({
      ...c,
      inChart: {
        providerId: r.provider_id,
        rank: r.rank,
        official: r.source === "netflix_tudum",
      },
    });
  }
  return out;
}

/**
 * Riempie ciò che manca ai candidati arrivati da TMDB: ZappScore, durata, anno, voti e
 * le piattaforme dove si vede.
 *
 * Regista e cast si chiedono solo per i primi `CON_PERSONE` e con la RPC
 * `title_people` (migration 0026), che apre `titles.raw` **dentro Postgres**: sul filo
 * passano i nomi, non i 27 KB per riga.
 *
 * Esportata perché la usa anche `src/lib/similar/personal.ts`: i simili vanno riempiti
 * allo stesso modo prima di passare per `affinity`, e riscrivere queste quattro query
 * altrove vorrebbe dire avere due idee diverse di cosa sia un candidato.
 */
export async function arricchisci(
  candidati: RankCandidate[],
  db: Db,
): Promise<RankCandidate[]> {
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
    db
      .from("titles")
      // `vote_count` non è un dettaglio del voto: **è la fama** (vedi `fame.ts`). Senza
      // questa colonna un candidato letto dal database avrebbe fama neutra, cioè un
      // classico da trentamila voti peserebbe come un film che non ha visto nessuno.
      .select(
        "id, media_type, runtime, release_date, backdrop_path, overview, vote_average, vote_count",
      )
      .in("id", ids),
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
    {
      runtime: number | null;
      release_date: string | null;
      backdrop_path: string | null;
      overview: string | null;
      vote_average: number | null;
      vote_count: number | null;
    }
  >();
  for (const r of (dettagli.data ?? []) as {
    id: number;
    media_type: MediaType;
    runtime: number | null;
    release_date: string | null;
    backdrop_path: string | null;
    overview: string | null;
    vote_average: number | null;
    vote_count: number | null;
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
      voteAverage:
        c.voteAverage ??
        (d?.vote_average === null || d?.vote_average === undefined
          ? null
          : Number(d.vote_average)),
      voteCount: c.voteCount ?? d?.vote_count ?? null,
      providerIds: offerta.get(k) ?? [],
      people: nomi.get(k) ?? [],
      backdropPath: c.backdropPath ?? d?.backdrop_path ?? null,
      overview: c.overview ?? d?.overview?.trim() ?? null,
    };
  });
}

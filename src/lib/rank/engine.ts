import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { PROVIDERS } from "@/lib/config";
import { HOME_SCOPE_VUOTO, type HomeScope } from "@/lib/home/scope";
import { createClient } from "@/lib/supabase/server";
import { getGenres } from "@/lib/tmdb/client";
import { affinity, PESI_BASE, qualitaDi } from "./affinity";
import { getCandidates } from "./candidates";
import { diversify } from "./diversity";
import { explain, nomeGenere, variaMotivi, type NomiPerMotivo } from "./explain";
import { appartiene, buildRails, MIN_RAIL } from "./rails";
import { applicaPreferiti, toTasteVector } from "./vector";
import { getRankWeights } from "./weights";
import type {
  Db,
  Dimensione,
  MediaType,
  PesiGusto,
  RankContext,
  RankedItem,
} from "./types";
import type { Tables } from "@/types/database";
import { getFavoriteKeys } from "@/lib/people/queries";

/**
 * Il motore: candidati → affinità → diversità → motivo.
 *
 * Non decide *dove* finiscono i titoli — quello è la fase D. Qui c'è solo la risposta
 * alla domanda "quanto è per lui, e perché".
 */

/** Quanti titoli tiene una lista consigliata. */
export const RANK_SIZE = 20;
/** Quante entry di libreria bastano a dedurre i generi di ripiego. */
const LIBRERIA_LIMITE = 300;
/** Quanti giorni indietro si guarda per capire se una copertina ha stancato. */
const STANCHEZZA_GIORNI = 14;

export async function getRankLabels(type: MediaType): Promise<NomiPerMotivo> {
  const generi = await getGenres(type).catch(() => null);
  return {
    generi: new Map(
      (generi?.genres ?? []).map((g) => [
        String(g.id),
        nomeGenere(String(g.id), g.name) ?? g.name,
      ]),
    ),
    provider: new Map(
      Object.entries(PROVIDERS).map(([id, p]) => [id, (p as { name: string }).name]),
    ),
  };
}

/**
 * Un numero stabile per tutta la giornata e diverso per ogni utente: è il seme con cui
 * i classici ruotano. Stesso utente, stesso giorno, stessa home; domani un'altra.
 */
export function semeDelGiorno(userId: string, now: Date = new Date()): number {
  const giorno = Math.floor(now.getTime() / 86_400_000);
  let h = giorno >>> 0;
  for (let i = 0; i < userId.length; i++) {
    h = Math.imul(h ^ userId.charCodeAt(i), 16777619) >>> 0 || 1;
  }
  return h >>> 0;
}

/**
 * Il contesto dell'utente: cosa ha già in libreria, quali generi guarda, chi ha messo
 * fra i preferiti e quali copertine gli abbiamo già fatto scorrere davanti senza
 * risultato.
 *
 * **Tutto arriva da qui e niente da `getViewer()`.** È la regola che rende il motore
 * collaudabile da riga di comando, ed è già stata violata una volta: il 2026-09-14 i
 * preferiti sono entrati in `rankFor` attraverso `getFavoriteKeys()`, che chiama
 * `getViewer()`, e `scripts/rank-dump.ts` ha smesso di funzionare
 * (`cookies was called outside a request scope`) senza che un solo test se ne
 * accorgesse. Per questo `preferiti` è un **parametro**: chi ha i cookie li legge e li
 * passa, chi non li ha passa un insieme vuoto.
 */
export async function rankContext(
  userId: string,
  db: Db,
  preferiti: readonly string[] = [],
): Promise<RankContext> {
  const [libreria, stanchi] = await Promise.all([
    db
      .from("watch_entries")
      .select(
        "title_id, media_type, status, title:titles!watch_entries_title_id_media_type_fkey(genres)",
      )
      .eq("user_id", userId)
      .order("last_watched_at", { ascending: false })
      .limit(LIBRERIA_LIMITE),
    // La stanchezza la conta Postgres (`rank_stanchezza`, migration 0061): contare in
    // memoria vorrebbe dire tirarsi su tutte le impression di due settimane per
    // ricavarne una manciata di righe.
    // `.rpc()` restituisce un thenable, non una `Promise`: `.catch` non esiste e il
    // compilatore lo dice. `then(ok, ko)` fa la stessa cosa e vale su entrambi.
    db.rpc("rank_stanchezza", { uid: userId, giorni: STANCHEZZA_GIORNI }).then(
      (r) => r,
      () => ({ data: null }),
    ),
  ]);
  const { data } = libreria;

  const mostratiSenzaApertura = new Map<string, number>();
  for (const r of (stanchi.data ?? []) as {
    title_id: number;
    media_type: MediaType;
    sessioni: number;
  }[]) {
    mostratiSenzaApertura.set(`${r.media_type}-${r.title_id}`, r.sessioni);
  }

  const inLibreria = new Set<string>();
  const conteggio = new Map<number, number>();
  for (const e of (data ?? []) as {
    title_id: number;
    media_type: MediaType;
    status: string | null;
    title: { genres: unknown } | null;
  }[]) {
    inLibreria.add(`${e.media_type}-${e.title_id}`);
    if (e.status !== "watched" && e.status !== "watching") continue;
    const generi = e.title?.genres;
    if (!Array.isArray(generi)) continue;
    for (const g of generi) {
      const id = g && typeof g === "object" ? (g as { id?: unknown }).id : null;
      if (typeof id === "number") conteggio.set(id, (conteggio.get(id) ?? 0) + 1);
    }
  }
  const generiDiRipiego = [...conteggio.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 2)
    .map(([id]) => id);

  return {
    db,
    userId,
    inLibreria,
    generiDiRipiego,
    preferiti: new Set(preferiti),
    mostratiSenzaApertura,
    seme: semeDelGiorno(userId),
  };
}

/**
 * I tetti di `diversify` dentro un ambito: in una home che **è** un genere il tetto di
 * tre per genere rimanderebbe in coda quasi tutto, e in una che **è** una piattaforma
 * il tetto di quattro per piattaforma farebbe lo stesso. Fuori dall'ambito valgono i
 * tetti normali.
 */
function tettiDi(
  scope: HomeScope,
  size: number,
): { perGenere?: number; perProvider?: number } {
  return {
    perGenere: scope.genre ? size : undefined,
    perProvider: scope.platforms.length > 0 ? size : undefined,
  };
}

/**
 * Il motore vero e proprio, senza dipendenze dalla richiesta HTTP. `scope` è la home
 * filtrata per genere e/o piattaforma: stesso motore, altri candidati.
 */
export async function rankFor(
  userId: string,
  type: MediaType,
  size: number,
  db: Db,
  profilo: Tables<"user_taste"> | null,
  scope: HomeScope = HOME_SCOPE_VUOTO,
  /**
   * Preferiti e pesi arrivano da fuori: il motore non deve poter chiamare
   * `getViewer()`. Vedi il commento su `rankContext`, e la regressione del 2026-09-14
   * che ha rotto lo script di collaudo per un giorno intero.
   */
  opzioni: { preferiti?: readonly string[]; pesi?: PesiGusto } = {},
): Promise<RankedItem[]> {
  const preferiti = opzioni.preferiti ?? [];
  const pesi = opzioni.pesi ?? PESI_BASE;
  const [ctx, etichette] = await Promise.all([
    rankContext(userId, db, preferiti),
    getRankLabels(type),
  ]);
  const vettore = applicaPreferiti(toTasteVector(profilo), [...preferiti]);
  const candidati = await getCandidates(type, vettore, ctx, { scope });
  if (candidati.length === 0) return [];

  const valutati: RankedItem[] = candidati
    .map((c) => {
      const a = affinity(vettore, c, pesi);
      return {
        ...c,
        punteggio: a.punteggio,
        percentuale: a.percentuale,
        contributi: a.contributi,
        motivo: explain(a.contributi, etichette, qualitaDi(c), c.friends, c.inChart),
      };
    })
    .sort((a, b) => b.punteggio - a.punteggio);

  return variaMotivi(
    diversify(valutati, size, tettiDi(scope, size)),
    etichette,
    qualitaDi,
  );
}

/**
 * In `cache()` per richiesta con **arità fissa**: `cache` fa chiave su tutti gli
 * argomenti, e `f("movie")` e `f("movie", 20, vuoto)` sarebbero due chiavi — cioè il
 * motore due volte per la stessa lista. I default stanno nel wrapper esportato.
 */
const rankedForYou = cache(
  async (type: MediaType, size: number, scope: HomeScope): Promise<RankedItem[]> => {
    const user = await getViewer();
    if (!user) return [];
    const db = await createClient();
    const [profiloRes, preferiti, pesi] = await Promise.all([
      db.from("user_taste").select("*").eq("user_id", user.id).maybeSingle(),
      getFavoriteKeys(),
      getRankWeights(db, user.id),
    ]);
    return rankFor(user.id, type, size, db, profiloRes.data ?? null, scope, {
      preferiti,
      pesi,
    });
  },
);

/** Quello che usa la home: stesso motore, con l'utente e il client della richiesta. */
export function getRankedForYou(
  type: MediaType,
  size = RANK_SIZE,
  scope: HomeScope = HOME_SCOPE_VUOTO,
): Promise<RankedItem[]> {
  return rankedForYou(type, size, scope);
}

export interface Rail {
  key: string;
  /** Da cosa nasce lo scaffale: la home li mette in punti diversi della pagina. */
  dimensione: Dimensione;
  titolo: string;
  items: RankedItem[];
}

/**
 * Gli scaffali che nascono dal profilo (fase D), riempiti con gli stessi candidati e la
 * stessa affinità di "Per te".
 *
 * `escludi` sono i titoli già mostrati sopra: un titolo in due file della stessa home è
 * un errore che si vede subito. Nessuna chiamata in più — `getCandidates` è già in
 * `cache()` per richiesta, quindi i rail leggono la lista che "Per te" ha già chiesto.
 */
const rails = cache(
  async (
    type: MediaType,
    escludi: ReadonlySet<string>,
    scope: HomeScope,
  ): Promise<Rail[]> => {
    const user = await getViewer();
    if (!user) return [];
    const db = await createClient();
    const { data: profilo } = await db
      .from("user_taste")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // `abbastanza` dipende solo dalla massa del profilo, mai dai preferiti
    // (`applicaPreferiti` non la tocca): si controlla prima di chiedere
    // `getFavoriteKeys`, cosi' un profilo troppo giovane non paga nemmeno quella
    // lettura, oltre a `rankContext`/`getRankLabels` piu' sotto.
    const base = toTasteVector(profilo ?? null);
    if (!base.abbastanza) return [];

    const [preferiti, pesi, etichette] = await Promise.all([
      getFavoriteKeys(),
      getRankWeights(db, user.id),
      getRankLabels(type),
    ]);
    const ctx = await rankContext(user.id, db, preferiti);
    const vettore = applicaPreferiti(base, preferiti);
    const specs = buildRails(vettore, etichette);
    if (specs.length === 0) return [];

    const candidati = await getCandidates(type, vettore, ctx, { scope });
    const valutati: RankedItem[] = candidati
      .map((c) => {
        const a = affinity(vettore, c, pesi);
        return {
          ...c,
          punteggio: a.punteggio,
          percentuale: a.percentuale,
          contributi: a.contributi,
          motivo: null as string | null,
        };
      })
      .sort((a, b) => b.punteggio - a.punteggio);

    const usati = new Set(escludi);
    const out: Rail[] = [];
    for (const spec of specs) {
      const items = valutati
        .filter((c) => !usati.has(`${c.mediaType}-${c.id}`))
        .filter((c) => appartiene(spec, c))
        .slice(0, RANK_SIZE);
      if (items.length < MIN_RAIL) continue;
      for (const i of items) usati.add(`${i.mediaType}-${i.id}`);
      // Il motivo non ripete il titolo dello scaffale: dentro "Perché ami la
      // fantascienza" scrivere venti volte "Perché guardi molto Fantascienza" è rumore.
      const conMotivo = variaMotivi(
        items.map((i) => {
          // I contributi si potano **prima**, non solo per il primo motivo: `variaMotivi`
          // ripesca dai contributi quando un motivo si ripete, e senza questa potatura
          // dentro "Il meglio degli anni 2010" ricompariva "Dagli anni 2010".
          const contributi = i.contributi.filter((c) => c.dimensione !== spec.dimensione);
          return {
            ...i,
            contributi,
            motivo: explain(contributi, etichette, qualitaDi(i), i.friends, i.inChart),
          };
        }),
        etichette,
        qualitaDi,
      );
      out.push({
        key: spec.key,
        dimensione: spec.dimensione,
        titolo: spec.titolo,
        items: diversify(conMotivo, RANK_SIZE, tettiDi(scope, RANK_SIZE)),
      });
    }
    return out;
  },
);

export function getRails(
  type: MediaType,
  escludi: ReadonlySet<string> = new Set(),
  scope: HomeScope = HOME_SCOPE_VUOTO,
): Promise<Rail[]> {
  return rails(type, escludi, scope);
}

/**
 * I rail della home, senza i titoli che "Per te" ha già mostrato.
 *
 * Sta qui e non nel componente perché la home rende i rail in **due punti** ("Ancora con
 * X" sopra "Perché hai visto", generi e decenni sotto) e `getRails` è in `cache()` per
 * coppia di argomenti: due Set costruiti nel componente sono due riferimenti diversi e
 * farebbero girare il motore due volte.
 */
const homeRails = cache(async (type: MediaType, scope: HomeScope): Promise<Rail[]> => {
  const [perTeFilm, perTeSerie] = await Promise.all([
    getRankedForYou("movie", RANK_SIZE, scope).catch(() => []),
    getRankedForYou("tv", RANK_SIZE, scope).catch(() => []),
  ]);
  const gia = new Set([...perTeFilm, ...perTeSerie].map((i) => `${i.mediaType}-${i.id}`));
  return getRails(type, gia, scope).catch(() => []);
});

export function getHomeRails(
  type: MediaType,
  scope: HomeScope = HOME_SCOPE_VUOTO,
): Promise<Rail[]> {
  return homeRails(type, scope);
}

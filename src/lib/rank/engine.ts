import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { PROVIDERS } from "@/lib/config";
import { HOME_SCOPE_VUOTO, type HomeScope } from "@/lib/home/scope";
import { createClient } from "@/lib/supabase/server";
import { getGenres } from "@/lib/tmdb/client";
import { affinity, qualitaDi } from "./affinity";
import { getCandidates } from "./candidates";
import { diversify } from "./diversity";
import { explain, nomeGenere, variaMotivi, type NomiPerMotivo } from "./explain";
import { appartiene, buildRails, MIN_RAIL } from "./rails";
import { applicaPreferiti, toTasteVector } from "./vector";
import type { Db, Dimensione, MediaType, RankContext, RankedItem } from "./types";
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
 * Il contesto dell'utente in una query sola: cosa ha già in libreria e quali generi
 * guarda. Serve al motore, e serve identico allo script di collaudo — per questo sta
 * qui e non dentro un `getViewer()` nascosto in fondo alla catena.
 */
export async function rankContext(userId: string, db: Db): Promise<RankContext> {
  const { data } = await db
    .from("watch_entries")
    .select(
      "title_id, media_type, status, title:titles!watch_entries_title_id_media_type_fkey(genres)",
    )
    .eq("user_id", userId)
    .order("last_watched_at", { ascending: false })
    .limit(LIBRERIA_LIMITE);

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

  return { db, userId, inLibreria, generiDiRipiego };
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
    perProvider: scope.platform ? size : undefined,
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
): Promise<RankedItem[]> {
  const [preferiti, ctx, etichette] = await Promise.all([
    getFavoriteKeys(),
    rankContext(userId, db),
    getRankLabels(type),
  ]);
  const vettore = applicaPreferiti(toTasteVector(profilo), preferiti);
  const candidati = await getCandidates(type, vettore, ctx, { scope });
  if (candidati.length === 0) return [];

  const valutati: RankedItem[] = candidati
    .map((c) => {
      const a = affinity(vettore, c);
      return {
        ...c,
        punteggio: a.punteggio,
        percentuale: a.percentuale,
        contributi: a.contributi,
        motivo: explain(a.contributi, etichette, qualitaDi(c), c.friends),
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
    const { data: profilo } = await db
      .from("user_taste")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    return rankFor(user.id, type, size, db, profilo ?? null, scope);
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

    const [preferiti, ctx, etichette] = await Promise.all([
      getFavoriteKeys(),
      rankContext(user.id, db),
      getRankLabels(type),
    ]);
    const vettore = applicaPreferiti(base, preferiti);
    const specs = buildRails(vettore, etichette);
    if (specs.length === 0) return [];

    const candidati = await getCandidates(type, vettore, ctx, { scope });
    const valutati: RankedItem[] = candidati
      .map((c) => {
        const a = affinity(vettore, c);
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
            motivo: explain(contributi, etichette, qualitaDi(i), i.friends),
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

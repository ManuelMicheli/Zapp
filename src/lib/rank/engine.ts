import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { PROVIDERS } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";
import { getGenres } from "@/lib/tmdb/client";
import { affinity, qualitaDi } from "./affinity";
import { getCandidates } from "./candidates";
import { diversify } from "./diversity";
import { explain, nomeGenere, variaMotivi, type NomiPerMotivo } from "./explain";
import { appartiene, buildRails, MIN_RAIL } from "./rails";
import { toTasteVector } from "./vector";
import type { Db, Dimensione, MediaType, RankContext, RankedItem } from "./types";
import type { Tables } from "@/types/database";

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

async function nomi(type: MediaType): Promise<NomiPerMotivo> {
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

/** Il motore vero e proprio, senza dipendenze dalla richiesta HTTP. */
export async function rankFor(
  userId: string,
  type: MediaType,
  size: number,
  db: Db,
  profilo: Tables<"user_taste"> | null,
): Promise<RankedItem[]> {
  const vettore = toTasteVector(profilo);
  const [ctx, etichette] = await Promise.all([rankContext(userId, db), nomi(type)]);
  const candidati = await getCandidates(type, vettore, ctx);
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

  return variaMotivi(diversify(valutati, size), etichette, qualitaDi);
}

/** Quello che usa la home: stesso motore, con l'utente e il client della richiesta. */
export const getRankedForYou = cache(
  async (type: MediaType, size = RANK_SIZE): Promise<RankedItem[]> => {
    const user = await getViewer();
    if (!user) return [];
    const db = await createClient();
    const { data: profilo } = await db
      .from("user_taste")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    return rankFor(user.id, type, size, db, profilo ?? null);
  },
);

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
export const getRails = cache(
  async (type: MediaType, escludi: ReadonlySet<string> = new Set()): Promise<Rail[]> => {
    const user = await getViewer();
    if (!user) return [];
    const db = await createClient();
    const { data: profilo } = await db
      .from("user_taste")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const vettore = toTasteVector(profilo ?? null);
    if (!vettore.abbastanza) return [];

    const [ctx, etichette] = await Promise.all([rankContext(user.id, db), nomi(type)]);
    const specs = buildRails(vettore, etichette);
    if (specs.length === 0) return [];

    const candidati = await getCandidates(type, vettore, ctx);
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
    const rails: Rail[] = [];
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
      rails.push({
        key: spec.key,
        dimensione: spec.dimensione,
        titolo: spec.titolo,
        items: diversify(conMotivo, RANK_SIZE),
      });
    }
    return rails;
  },
);

/**
 * I rail della home, senza i titoli che "Per te" ha già mostrato.
 *
 * Sta qui e non nel componente perché la home rende i rail in **due punti** ("Ancora con
 * X" sopra "Perché hai visto", generi e decenni sotto) e `getRails` è in `cache()` per
 * coppia di argomenti: due Set costruiti nel componente sono due riferimenti diversi e
 * farebbero girare il motore due volte.
 */
export const getHomeRails = cache(async (type: MediaType): Promise<Rail[]> => {
  const [perTeFilm, perTeSerie] = await Promise.all([
    getRankedForYou("movie").catch(() => []),
    getRankedForYou("tv").catch(() => []),
  ]);
  const gia = new Set([...perTeFilm, ...perTeSerie].map((i) => `${i.mediaType}-${i.id}`));
  return getRails(type, gia).catch(() => []);
});

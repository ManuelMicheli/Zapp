import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { affinity } from "@/lib/rank/affinity";
import { arricchisci } from "@/lib/rank/candidates";
import type { RankCandidate } from "@/lib/rank/types";
import { toTasteVector, type TasteVector } from "@/lib/rank/vector";
import { getPersonalizationEnabled, getTasteProfile } from "@/lib/taste/queries";
import { createClient } from "@/lib/supabase/server";
import { applyAffinity } from "./personal-rank";
import type { SimilarItem } from "./types";

/**
 * Il pezzo personale dei simili, e l'unico posto dove i consigli incontrano l'utente.
 *
 * **Un solo profilo di gusto in tutta l'app**: quello della fase A (`user_taste`), letto
 * come vettore dalla fase C e pesato con la sua `affinity`. Questo modulo non deduce
 * nulla per conto proprio — c'era una versione povera qui dentro (registi e keyword
 * ricorrenti fra i titoli finiti) ed è stata tolta il 2026-09-08: due definizioni di
 * "cosa piace a questa persona" sono una di troppo, e quella buona è la fase A, che
 * guarda anche ciò che l'utente apre e scorre, non solo ciò che finisce.
 *
 * La classifica salvata in `title_similar` resta **impersonale e condivisa**: il gusto
 * si applica qui, in memoria, per chi sta guardando.
 */

/** Quanti titoli al massimo si arricchiscono per calcolare l'affinità. */
const MAX_ARRICCHITI = 120;

export interface PersonalContext {
  vector: TasteVector;
  /** Falso se l'utente ha spento la personalizzazione, o non c'è utente. */
  attiva: boolean;
}

/**
 * Il profilo di chi sta guardando, una volta per richiesta. Se la personalizzazione è
 * spenta si torna un vettore vuoto: l'affinità resta neutra e l'ordine è quello
 * pubblico, che è esattamente ciò che l'utente ha chiesto spegnendola.
 */
export const getPersonalContext = cache(async (): Promise<PersonalContext> => {
  const vuoto = { vector: toTasteVector(null), attiva: false };
  const user = await getViewer();
  if (!user) return vuoto;
  const [attiva, profilo] = await Promise.all([
    getPersonalizationEnabled().catch(() => true),
    getTasteProfile(user.id).catch(() => null),
  ]);
  if (!attiva) return vuoto;
  return { vector: toTasteVector(profilo), attiva: true };
});

/** Un titolo dei simili nella forma che l'affinità sa pesare. */
function toRankCandidate(item: SimilarItem): RankCandidate {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    posterPath: item.posterPath ?? "",
    backdropPath: null,
    overview: null,
    year: item.year ? String(item.year) : null,
    genreIds: item.genreIds,
    runtime: null,
    originalLanguage: null,
    providerIds: [],
    people: [],
    zappScore: null,
    voteAverage: null,
    voteCount: null,
    friends: null,
  };
}

/**
 * Ripesa più liste di simili sull'affinità dell'utente, **arricchendo una volta sola**
 * l'unione di tutti i titoli: la home ne mostra fino a otto scaffali e una passata per
 * scaffale sarebbe otto volte le stesse query.
 *
 * `owned` sono i titoli già in libreria, che spariscono da ogni lista.
 */
export async function personalizeSimilar(
  lists: readonly (readonly SimilarItem[])[],
  owned: ReadonlySet<string> = new Set(),
): Promise<SimilarItem[][]> {
  const { vector, attiva } = await getPersonalContext();
  // Profilo assente o personalizzazione spenta: resta l'ordine pubblico, tolta la
  // libreria. Nessuna query sprecata per un'affinità che sarebbe neutra comunque.
  if (!attiva || vector.fiducia <= 0) {
    return lists.map((items) => applyAffinity(items, new Map(), owned));
  }

  const unici = new Map<string, SimilarItem>();
  for (const items of lists) {
    for (const item of items) {
      const key = `${item.mediaType}-${item.id}`;
      if (!unici.has(key) && !owned.has(key)) unici.set(key, item);
    }
  }

  const punteggi = new Map<string, number>();
  try {
    const db = await createClient();
    const candidati = await arricchisci(
      [...unici.values()].slice(0, MAX_ARRICCHITI).map(toRankCandidate),
      db,
    );
    for (const candidato of candidati) {
      punteggi.set(
        `${candidato.mediaType}-${candidato.id}`,
        affinity(vector, candidato).punteggio,
      );
    }
  } catch (error) {
    // Un'affinità che non si calcola vale meno di uno scaffale che non compare:
    // si torna all'ordine pubblico.
    console.error("[simili] affinità non calcolata:", error);
  }

  return lists.map((items) => applyAffinity(items, punteggi, owned));
}

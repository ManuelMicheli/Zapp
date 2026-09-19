import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";

/**
 * Letture su `short_film_entries` (migration 0064). Nessun controllo di permessi
 * scritto qui: la policy lascia passare solo le proprie righe, e per chiunque altro
 * la `select` torna vuota da sola.
 */

export interface StatoCorto {
  /** Quando e' stato segnato come visto; `null` = non visto. */
  vistoIl: string | null;
  preferito: boolean;
}

export const CORTO_NON_SEGNATO: StatoCorto = { vistoIl: null, preferito: false };

/**
 * Lo stato di **tutti** i corti dell'utente, in una mappa per id YouTube.
 *
 * Una query sola per pagina, non una per card: la griglia di `/corti` disegna cento
 * riquadri e cento query sarebbero cento andate e ritorni. Le righe sono poche per
 * definizione — al massimo cento, una per corto del catalogo — quindi prenderle
 * tutte costa meno che filtrarle.
 *
 * `cache` perche' nella stessa pagina la chiedono la griglia e il contatore in testa.
 */
export const getStatoCorti = cache(async (): Promise<Map<string, StatoCorto>> => {
  const viewer = await getViewer();
  if (!viewer) return new Map();

  const supabase = await createClient();
  const { data } = await supabase
    .from("short_film_entries")
    .select("short_id, watched_at, favorite")
    .eq("user_id", viewer.id);

  return new Map(
    (data ?? []).map((r) => [
      r.short_id,
      { vistoIl: r.watched_at, preferito: r.favorite },
    ]),
  );
});

/** Lo stato di un corto solo, senza una query in piu': passa dalla mappa. */
export async function getStatoCorto(youtubeId: string): Promise<StatoCorto> {
  return (await getStatoCorti()).get(youtubeId) ?? CORTO_NON_SEGNATO;
}

export interface ContiCorti {
  visti: number;
  preferiti: number;
}

/** Quanti ne hai visti e quanti ne hai messi tra i preferiti. */
export async function getContiCorti(): Promise<ContiCorti> {
  const stato = await getStatoCorti();
  let visti = 0;
  let preferiti = 0;
  for (const s of stato.values()) {
    if (s.vistoIl) visti += 1;
    if (s.preferito) preferiti += 1;
  }
  return { visti, preferiti };
}

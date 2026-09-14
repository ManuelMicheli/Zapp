/**
 * Il ruolo di una persona preferita, e come si calcola da TMDB.
 *
 * Un tipo solo e una funzione sola, in un file **senza** `server-only`: lo
 * importano sia moduli server (`queries.ts`, `actions.ts`, `src/lib/tmdb/mappers.ts`)
 * sia componenti client (`FavoritePersonButton`, `PersonHeader`). Se il tipo vivesse
 * in `queries.ts` (che è `server-only`), un componente client potrebbe importarlo
 * solo con `import type` — un dettaglio in più da ricordare ad ogni nuovo
 * consumatore, per un tipo che non porta nessun codice da eseguire. Qui non serve
 * ricordarselo: `import type` funziona comunque, ma anche un `import` normale non
 * fa scattare `server-only`, perché non c'è nulla da eseguire.
 */
export type PersonRole = "Cast" | "Regia";

/**
 * `known_for_department` di TMDB non dice il genere della persona, ma dice il
 * reparto: `Directing` è regia, tutto il resto (di solito `Acting`) è cast.
 * Funzione unica per questa conversione: `src/lib/search/instant.ts` la scriveva a
 * mano una seconda volta per un campo (`SearchPerson.role`) che non serviva a
 * nessuno ed è stato tolto (M10 della review finale) — invece di lasciarla lì per
 * il prossimo che ne avrà bisogno, la conversione sta qui, pronta.
 */
export function ruoloDiReparto(department: string | null | undefined): PersonRole {
  return department === "Directing" ? "Regia" : "Cast";
}

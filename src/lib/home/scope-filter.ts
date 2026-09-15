import "server-only";

import type { Db, MediaType } from "@/lib/rank/types";
import { chiaveTitolo, onPlatform, type TitleKeyLike } from "@/lib/platforms/filter";
import { inGenre, scopeVuoto, type HomeScope } from "./scope";

/**
 * Il filtro dell'ambito per le liste che nascono **dal database** — classifiche,
 * libreria, amici, simili —, cioè per titoli che non portano con sé né i generi né le
 * piattaforme. La piattaforma la dice `title_providers` (`kind = flatrate`), il genere
 * `titles.genres` + `release_date` letti in una query per blocco; un titolo che la
 * cache non conosce **non passa**: meglio una copertina in meno che una promessa
 * sbagliata. Le liste che arrivano da un `discover` con la ricetta dell'ambito sono già
 * certe e non passano di qui (vedi `src/lib/rank/scoped.ts`).
 */

/** Quante chiavi entrano in una `in()`: oltre, PostgREST fa URL troppo lunghi. */
const BLOCCO = 300;

function generiDi(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => (g && typeof g === "object" ? (g as { id?: unknown }).id : null))
    .filter((id): id is number => typeof id === "number");
}

/** Le chiavi, fra quelle date, dei titoli che stanno nel genere secondo `titles`. */
async function nelGenere(
  db: Db,
  titoli: readonly TitleKeyLike[],
  scope: HomeScope,
): Promise<Set<string>> {
  const out = new Set<string>();
  const genre = scope.genre;
  if (!genre) return out;
  const ids = [...new Set(titoli.map((t) => t.id))];
  if (ids.length === 0) return out;

  const blocchi: number[][] = [];
  for (let i = 0; i < ids.length; i += BLOCCO) blocchi.push(ids.slice(i, i + BLOCCO));
  const risposte = await Promise.all(
    blocchi.map((blocco) =>
      db.from("titles").select("id, media_type, genres, release_date").in("id", blocco),
    ),
  );
  for (const { data, error } of risposte) {
    if (error) {
      console.error("[ambito] generi dei titoli non letti:", error.message);
      continue;
    }
    for (const r of (data ?? []) as {
      id: number;
      media_type: MediaType;
      genres: unknown;
      release_date: string | null;
    }[]) {
      const dentro = inGenre(genre, {
        mediaType: r.media_type,
        genreIds: generiDi(r.genres),
        year: r.release_date ? r.release_date.slice(0, 4) : null,
      });
      if (dentro === true) out.add(`${r.media_type}-${r.id}`);
    }
  }
  return out;
}

/**
 * Le chiavi `tipo-id`, fra quelle date, che stanno nell'ambito. Senza filtri, tutte.
 * Genere e piattaforma si leggono in parallelo, e un titolo passa solo se passa
 * entrambi.
 */
export async function chiaviNelloScope(
  db: Db,
  titoli: readonly TitleKeyLike[],
  scope: HomeScope,
): Promise<Set<string>> {
  if (scopeVuoto(scope)) return new Set(titoli.map(chiaveTitolo));
  const [suPiattaforma, nelGen] = await Promise.all([
    scope.platform ? onPlatform(db, titoli, scope.platform) : null,
    scope.genre ? nelGenere(db, titoli, scope) : null,
  ]);
  const out = new Set<string>();
  for (const t of titoli) {
    const k = chiaveTitolo(t);
    if (suPiattaforma && !suPiattaforma.has(k)) continue;
    if (nelGen && !nelGen.has(k)) continue;
    out.add(k);
  }
  return out;
}

/** Tiene solo i titoli che stanno nell'ambito; senza filtri, tutti (stesso ordine). */
export async function filtraScope<T extends TitleKeyLike>(
  db: Db,
  items: readonly T[],
  scope: HomeScope,
): Promise<T[]> {
  if (scopeVuoto(scope)) return [...items];
  const dentro = await chiaviNelloScope(db, items, scope);
  return items.filter((i) => dentro.has(chiaveTitolo(i)));
}

/**
 * Cosa non entra fra i consigli. Puro e testato, perché sono regole di prodotto e non
 * dettagli tecnici: si sono viste solo stampando le liste vere (`scripts/rank-dump.ts`,
 * 2026-09-07), mai in un test unitario.
 */

/**
 * Generi TV che non sono "qualcosa da guardare stasera": programmi per bambini,
 * notiziari, reality e talk show. TMDB li restituisce con voti altissimi (un talk show
 * ha vent'anni di puntate) e senza questo filtro riempivano metà della lista di David
 * Letterman, Stephen Colbert e Sesamo apriti!. L'animazione **non** è qui: è un genere
 * come gli altri e piace a molta gente.
 *
 * Non basta però il genere: "Good Mythical Morning" su TMDB è una commedia e basta, e
 * "All Elite Wrestling: Dynamite" è azione. Per quelli serve il filtro alla fonte,
 * `discoverByGenre(..., { scriptedOnly: true })`, che chiede a TMDB solo miniserie e
 * serie sceneggiate.
 */
export const GENERI_TV_ESCLUSI = new Set([10762, 10763, 10764, 10767]);

/**
 * Un titolo si consiglia solo se sappiamo dirne il nome in caratteri latini.
 *
 * TMDB, quando non ha la traduzione italiana, restituisce il nome originale: nelle
 * liste vere comparivano "멀리서 보면 푸른 봄" e "監獄風雲". Non è snobismo verso i drama
 * coreani — un drama coreano *con titolo italiano* resta e si consiglia volentieri —:
 * è che a un utente italiano non si mette davanti una copertina di cui non può nemmeno
 * leggere il nome, e quasi sempre significa che in Italia quel titolo non è uscito.
 * Vedi la regola sulla lingua del progetto.
 */
export function nomeLeggibile(titolo: string): boolean {
  if (!titolo.trim()) return false;
  // CJK, hiragana, katakana, hangul, cirillico, arabo, ebraico, thai, devanagari
  return !/[Ѐ-ӿ֐-׿؀-ۿऀ-ॿ฀-๿぀-ヿ㐀-䶿一-鿿가-힯]/.test(titolo);
}

/** `true` se il candidato può stare in una lista di consigli. */
export function consigliabile(c: {
  mediaType: "movie" | "tv";
  title: string;
  genreIds: number[];
}): boolean {
  if (!nomeLeggibile(c.title)) return false;
  if (c.mediaType === "tv" && c.genreIds.some((g) => GENERI_TV_ESCLUSI.has(g))) {
    return false;
  }
  return true;
}

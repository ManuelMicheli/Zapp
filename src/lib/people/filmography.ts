import type { TmdbPersonMovieCredits, TmdbPersonTvCredits } from "@/lib/tmdb/types";

/**
 * Da due risposte TMDB alla filmografia che la pagina mostra.
 *
 * Funzione **pura**: qui stanno le sole scelte discutibili — cosa si butta via e in
 * che ordine si mette il resto — e si provano con dati finti invece che aprendo la
 * pagina di Tom Hanks e contando le locandine.
 */

/** Oltre questi, la pagina e' un elenco telefonico e nessuno scorre fino in fondo. */
export const MAX_CREDITI = 60;

/**
 * Generi TV che non sono un titolo "fatto" da questa persona ma una sua ospitata:
 * talk show (10767), notiziari (10763), reality e premiazioni (10764). Senza questo
 * filtro la filmografia di Tom Hanks apriva con sette talk show e I Simpson prima di
 * Forrest Gump, perche' un programma che va in onda ogni sera ha popolarita' altissima.
 */
const GENERI_OSPITATA = new Set([10767, 10763, 10764]);

/**
 * Personaggio che dice "e' venuto a farsi intervistare", non "ha recitato". TMDB non
 * localizza il campo `character`, ma l'italiano c'e' su qualche riga vecchia.
 * `Archive footage` e' materiale di repertorio: la persona non era sul set.
 *
 * `\bself` senza confine finale di proposito: sui crediti veri si legge `Selft`,
 * `Self-`, `Selfe`, e un refuso di TMDB non deve rimettere in pagina un'ospitata.
 */
const PERSONAGGIO_NON_RUOLO =
  /\bself|himself|herself|themselves|s[eé] stess|archive footage|filmati d'archivio|uncredited|non accreditat/i;

/**
 * Documentario. Vale **solo per il cast**: chi compare in un documentario ci compare
 * quasi sempre come se stesso (spesso senza che TMDB scriva `Self` nel personaggio),
 * mentre chi lo dirige l'ha diretto per davvero e resta nella sezione regia.
 */
const GENERE_DOCUMENTARIO = 99;

/**
 * Nessun voto e nessuno che la guardi: non e' un titolo, e' materiale extra
 * ("Avengers Endgame: Encore", "Onward: Magic Gems"), che TMDB accredita come film.
 * La popolarita' salva l'uscita fresca che i voti non li ha ancora presi.
 */
const POPOLARITA_MINIMA_SENZA_VOTI = 10;

/**
 * Sotto due episodi non e' la sua serie ma una comparsa da un episodio (Zendaya in
 * Black-ish, Tom Hanks in Love Boat). Si perde qualche film per la TV accreditato
 * come serie da un episodio solo: e' un prezzo piu' basso di trenta comparsate.
 */
const MIN_EPISODI = 2;

export interface CreditoPersona {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  /** Mai `null`: i crediti senza locandina non entrano nemmeno. */
  posterPath: string;
  year: string | null;
  voteAverage: number | null;
}

export interface Filmografia {
  interprete: CreditoPersona[];
  regista: CreditoPersona[];
}

/** Quello che serve qui di un risultato TMDB, film o serie che sia. */
interface CreditoGrezzo {
  id?: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  adult?: boolean;
  /** Solo sul cast: `Woody (voice)`, `Self - Guest`, ... */
  character?: string;
  /** Solo sul cast TV: in quanti episodi appare. */
  episode_count?: number;
  job?: string;
}

/**
 * Quanto un titolo e' **noto**, che non e' quanto e' di moda adesso.
 *
 * Il numero di voti e' l'unico segnale di fama che TMDB da' gratis e non si muove col
 * vento: No Way Home ne ha 23.000, un talk show 215. `popularity` invece misura le
 * visite di questa settimana, e da sola metteva un'ospitata da Fallon davanti a Dune.
 * Resta con peso 10 solo per non spedire in fondo un'uscita fresca che i voti non ha
 * ancora: 10 voti equivalgono a un punto di popolarita'.
 */
function notorieta(c: CreditoGrezzo): number {
  return (c.vote_count ?? 0) + (c.popularity ?? 0) * 10;
}

/** `false` per le ospitate, il repertorio, i cameo da un episodio e gli extra. */
function eUnRuolo(
  grezzo: CreditoGrezzo,
  mediaType: "movie" | "tv",
  reparto: "cast" | "crew",
): boolean {
  if (grezzo.adult === true) return false;
  if (grezzo.character && PERSONAGGIO_NON_RUOLO.test(grezzo.character)) return false;
  const generi = grezzo.genre_ids ?? [];
  if (generi.some((g) => GENERI_OSPITATA.has(g))) return false;
  if (reparto === "cast" && generi.includes(GENERE_DOCUMENTARIO)) return false;
  if (
    (grezzo.vote_count ?? 0) === 0 &&
    (grezzo.popularity ?? 0) < POPOLARITA_MINIMA_SENZA_VOTI
  ) {
    return false;
  }
  // `episode_count` manca sulla troupe (`crew`): lì il filtro non si applica.
  if (
    mediaType === "tv" &&
    typeof grezzo.episode_count === "number" &&
    grezzo.episode_count < MIN_EPISODI
  ) {
    return false;
  }
  return true;
}

function mappa(
  grezzo: CreditoGrezzo,
  mediaType: "movie" | "tv",
  reparto: "cast" | "crew",
): (CreditoPersona & { notorieta: number }) | null {
  const titolo = (mediaType === "movie" ? grezzo.title : grezzo.name)?.trim();
  const poster = grezzo.poster_path;
  if (!grezzo.id || !titolo || !poster) return null;
  if (!eUnRuolo(grezzo, mediaType, reparto)) return null;
  const data = mediaType === "movie" ? grezzo.release_date : grezzo.first_air_date;
  const voto = grezzo.vote_average;
  return {
    id: grezzo.id,
    mediaType,
    title: titolo,
    posterPath: poster,
    year: data && data.length >= 4 ? data.slice(0, 4) : null,
    // TMDB scrive 0 sui titoli che nessuno ha votato, e "0" si legge come stroncatura
    voteAverage: voto && voto > 0 ? voto : null,
    notorieta: notorieta(grezzo),
  };
}

function raccogli(
  liste: { crediti: CreditoGrezzo[]; mediaType: "movie" | "tv" }[],
  reparto: "cast" | "crew",
): CreditoPersona[] {
  const visti = new Set<string>();
  const out: (CreditoPersona & { notorieta: number })[] = [];
  for (const { crediti, mediaType } of liste) {
    for (const grezzo of crediti) {
      const c = mappa(grezzo, mediaType, reparto);
      if (!c) continue;
      // stesso id su un film e su una serie sono due titoli diversi
      const chiave = `${c.mediaType}-${c.id}`;
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      out.push(c);
    }
  }
  // A pari notorieta' (due titoli senza voti ne' popolarita') l'id tiene l'ordine
  // stabile: senza, due render della stessa pagina potevano scambiarli di posto.
  out.sort((a, b) => b.notorieta - a.notorieta || a.id - b.id);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return out.slice(0, MAX_CREDITI).map(({ notorieta: _, ...resto }) => resto);
}

export function filmografia(
  movies: TmdbPersonMovieCredits | null | undefined,
  tv: TmdbPersonTvCredits | null | undefined,
): Filmografia {
  const soloRegia = (crediti: CreditoGrezzo[]) =>
    crediti.filter((c) => c.job === "Director");

  return {
    interprete: raccogli(
      [
        { crediti: (movies?.cast ?? []) as CreditoGrezzo[], mediaType: "movie" },
        { crediti: (tv?.cast ?? []) as CreditoGrezzo[], mediaType: "tv" },
      ],
      "cast",
    ),
    regista: raccogli(
      [
        {
          crediti: soloRegia((movies?.crew ?? []) as CreditoGrezzo[]),
          mediaType: "movie",
        },
        { crediti: soloRegia((tv?.crew ?? []) as CreditoGrezzo[]), mediaType: "tv" },
      ],
      "crew",
    ),
  };
}

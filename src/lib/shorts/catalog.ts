import dati from "@/data/short-films.json";

/**
 * Il catalogo dei cortometraggi riproducibili dentro Zapp.
 *
 * Sta in un file e non nel database (vedi migration 0064): cambia con un rilascio,
 * non con l'uso. `src/data/short-films.json` e' generato a partire da una
 * raccolta di link YouTube, incrociata con `videos.list` dell'API YouTube per
 * prendere durata, anno, canale e visualizzazioni vere; le trame sono scritte in
 * italiano a mano. Come si rigenera sta in `docs/architecture/short-films.md`.
 *
 * Tre regole decidono **quali** corti entrano: solo video che YouTube dichiara
 * `embeddable` e pubblici (un corto che non si puo' incorporare qui sarebbe una card
 * che non si apre), solo caricamenti del titolare o di un canale che distribuisce su
 * licenza (niente ricaricamenti di corti Pixar o Disney su canali terzi: Zapp non
 * mette in pagina un video che non ha diritto di stare online), e una trama vera: un corto
 * il cui canale pubblica solo crediti e link resta fuori, perche' una trama inventata
 * e' peggio di un corto in meno.
 *
 * L'ordine e' la fama misurata sulle visualizzazioni, prima gli inglesi e poi gli
 * italiani: un'unica classifica mescolata metterebbe l'italiano piu' visto oltre la
 * centesima posizione, e Zapp e' un'app italiana.
 */

import { cardDi, type ShortCardData, type ShortFilm } from "./shape";

export * from "./shape";

export const SHORT_FILMS: ShortFilm[] = dati.corti as ShortFilm[];

/** Le card di tutto il catalogo, calcolate una volta sola per processo. */
export const SHORT_CARDS: ShortCardData[] = SHORT_FILMS.map(cardDi);

/** Il giorno in cui il file e' stato generato: lo mostra il piede della pagina. */
export const SHORT_FILMS_GENERATO = dati.generato;

const perSlug = new Map(SHORT_FILMS.map((c) => [c.slug, c]));
const perId = new Map(SHORT_FILMS.map((c) => [c.youtubeId, c]));

export function shortBySlug(slug: string): ShortFilm | null {
  return perSlug.get(slug) ?? null;
}

export function shortById(youtubeId: string): ShortFilm | null {
  return perId.get(youtubeId) ?? null;
}

/**
 * I generi presenti, nell'ordine in cui compaiono le pillole: prima i piu' numerosi,
 * perche' una pillola che filtra due titoli su quattrocento non merita il primo posto.
 */
export const SHORT_GENERI: string[] = [...new Set(SHORT_FILMS.map((c) => c.genere))].sort(
  (a, b) => {
    const conta = (g: string) => SHORT_FILMS.filter((c) => c.genere === g).length;
    return conta(b) - conta(a) || a.localeCompare(b, "it");
  },
);

/**
 * Altri corti da vedere dopo questo: prima lo stesso genere, poi il resto, sempre
 * nell'ordine del catalogo (fama decrescente). Niente di piu' furbo: un motore di
 * somiglianza vero su un catalogo curato a mano costerebbe piu' di quanto renda, e la
 * fama e' gia' un buon secondo criterio.
 */
export function shortsSimili(corto: ShortFilm, quanti = 12): ShortFilm[] {
  const altri = SHORT_FILMS.filter((c) => c.slug !== corto.slug);
  const stessoGenere = altri.filter((c) => c.genere === corto.genere);
  const resto = altri.filter((c) => c.genere !== corto.genere);
  return [...stessoGenere, ...resto].slice(0, quanti);
}

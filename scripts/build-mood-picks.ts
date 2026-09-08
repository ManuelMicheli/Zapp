/**
 * Genera `src/data/mood-picks.json`: per ogni mood, i titoli scelti a mano perché
 * *sono* quello stato d'animo, risolti su TMDB con la loro fama misurata (numero di
 * voti), la locandina e i generi.
 *
 *   pnpm tsx --conditions=react-server --env-file=.env.local scripts/build-mood-picks.ts
 *
 * Si rilancia quando si cambia una lista qui sotto. Il JSON che ne esce viene letto a
 * runtime senza una sola chiamata a TMDB: la testa di una fila di mood non deve costare
 * venticinque fetch.
 *
 * Le liste sono **curate apposta**: i generi non sanno distinguere un dramma commovente
 * da un dramma di guerra, e "triste" con `with_genres=18` dava un dramma qualsiasi molto
 * votato. Qui ogni titolo è lì perché qualcuno lo metterebbe davvero in quella lista.
 */

import { writeFileSync } from "node:fs";
import { searchMovies, searchTv } from "../src/lib/tmdb/client";
import type { TmdbMovieResult, TmdbTvResult } from "../src/lib/tmdb/types";

interface Seme {
  /** Come cercarlo su TMDB: titolo italiano o originale, quello che trova meglio. */
  q: string;
  /** Anno di uscita, per scartare i remake e gli omonimi. */
  anno: number;
  tipo: "movie" | "tv";
}

const f = (q: string, anno: number): Seme => ({ q, anno, tipo: "movie" });
const s = (q: string, anno: number): Seme => ({ q, anno, tipo: "tv" });

const SEMI: Record<string, Seme[]> = {
  leggero: [
    f("Il diavolo veste Prada", 2006),
    f("Quasi amici", 2011),
    f("Perfetti sconosciuti", 2016),
    f("Mamma Mia!", 2008),
    f("Crazy, Stupid, Love.", 2011),
    f("Il diario di Bridget Jones", 2001),
    f("Notting Hill", 1999),
    f("Love Actually - L'amore davvero", 2003),
    f("Il favoloso mondo di Amélie", 2001),
    f("School of Rock", 2003),
    f("Una settimana da Dio", 2003),
    f("Zootropolis", 2016),
    f("Shrek", 2001),
    f("Ratatouille", 2007),
    f("Paddington 2", 2017),
    f("Sister Act - Una svitata in abito da suora", 1992),
    f("Come d'incanto", 2007),
    f("Ferris Bueller's Day Off", 1986),
    f("Smetto quando voglio", 2014),
    f("Benvenuti al Sud", 2010),
    f("Il Grande Lebowski", 1998),
    f("Ricomincio da capo", 1993),
    s("Ted Lasso", 2020),
    s("Brooklyn Nine-Nine", 2013),
    s("The Office", 2005),
    s("Modern Family", 2009),
  ],
  triste: [
    f("Il miglio verde", 1999),
    f("La vita è bella", 1997),
    f("Schindler's List", 1993),
    f("Forrest Gump", 1994),
    f("Manchester by the Sea", 2016),
    f("La ricerca della felicità", 2006),
    f("Una tomba per le lucciole", 1988),
    f("Coco", 2017),
    f("Up", 2009),
    f("Inside Out", 2015),
    f("Room", 2015),
    f("Il bambino con il pigiama a righe", 2008),
    f("Hachiko - Il tuo migliore amico", 2009),
    f("Io e Marley", 2008),
    f("Titanic", 1997),
    f("Colpa delle stelle", 2014),
    f("Io prima di te", 2016),
    f("A Star Is Born", 2018),
    f("Still Alice", 2014),
    f("Big Fish - Le storie di una vita incredibile", 2003),
    f("Sette anime", 2008),
    f("Vi presento Joe Black", 1998),
    s("This Is Us", 2016),
    s("After Life", 2019),
    s("Chernobyl", 2019),
  ],
  carico: [
    f("Mad Max: Fury Road", 2015),
    f("Il cavaliere oscuro", 2008),
    f("John Wick", 2014),
    f("Inception", 2010),
    f("Top Gun: Maverick", 2022),
    f("Mission: Impossible - Fallout", 2018),
    f("Il gladiatore", 2000),
    f("Trappola di cristallo", 1988),
    f("Matrix", 1999),
    f("Terminator 2 - Il giorno del giudizio", 1991),
    f("Heat - La sfida", 1995),
    f("Baby Driver - Il genio della fuga", 2017),
    f("Edge of Tomorrow - Senza domani", 2014),
    f("Casino Royale", 2006),
    f("Sicario", 2015),
    f("300", 2006),
    f("Dunkirk", 2017),
    f("The Bourne Identity", 2002),
    f("Avengers: Endgame", 2019),
    f("Kingsman - Secret Service", 2014),
    f("Fast & Furious 5", 2011),
    f("Speed", 1994),
    s("La casa di carta", 2017),
    s("Prison Break", 2005),
    s("24", 2001),
  ],
  "cuore-infranto": [
    f("Se mi lasci ti cancello", 2004),
    f("La La Land", 2016),
    f("(500) giorni insieme", 2009),
    f("Blue Valentine", 2010),
    f("Storia di un matrimonio", 2019),
    f("Casablanca", 1942),
    f("I segreti di Brokeback Mountain", 2005),
    f("Chiamami col tuo nome", 2017),
    f("Past Lives", 2023),
    f("Lei", 2013),
    f("Lost in Translation - L'amore tradotto", 2003),
    f("Le pagine della nostra vita", 2004),
    f("Closer", 2004),
    f("Revolutionary Road", 2008),
    f("Once", 2007),
    f("One Day", 2011),
    f("Blue Jasmine", 2013),
    f("La forma dell'acqua", 2017),
    f("Carol", 2015),
    f("Un amore all'improvviso", 2009),
    s("Normal People", 2020),
    s("Fleabag", 2016),
  ],
  paura: [
    f("Shining", 1980),
    f("L'esorcista", 1973),
    f("Hereditary - Le radici del male", 2018),
    f("Scappa - Get Out", 2017),
    f("It", 2017),
    f("A Quiet Place - Un posto tranquillo", 2018),
    f("Sinister", 2012),
    f("L'evocazione - The Conjuring", 2013),
    f("Halloween - La notte delle streghe", 1978),
    f("Psyco", 1960),
    f("Alien", 1979),
    f("La cosa", 1982),
    f("Midsommar - Il villaggio dei dannati", 2019),
    f("Babadook", 2014),
    f("The Ring", 2002),
    f("Scream", 1996),
    f("Insidious", 2010),
    f("Suspiria", 1977),
    f("Nope", 2022),
    f("Smile", 2022),
    f("Talk to Me", 2022),
    f("Non aprite quella porta", 1974),
    s("The Haunting of Hill House", 2018),
    s("American Horror Story", 2011),
    s("The Walking Dead", 2010),
  ],
  "cervello-acceso": [
    f("Inception", 2010),
    f("Interstellar", 2014),
    f("Memento", 2000),
    f("Arrival", 2016),
    f("Shutter Island", 2010),
    f("Fight Club", 1999),
    f("Il sesto senso", 1999),
    f("Seven", 1995),
    f("Prisoners", 2013),
    f("Donnie Darko", 2001),
    f("The Prestige", 2006),
    f("Blade Runner 2049", 2017),
    f("Ex Machina", 2014),
    f("Tenet", 2020),
    f("Old Boy", 2003),
    f("Mulholland Drive", 2001),
    f("Enemy", 2013),
    f("L'amore bugiardo - Gone Girl", 2014),
    f("Parasite", 2019),
    f("Predestination", 2014),
    f("Coherence", 2013),
    f("Primer", 2004),
    s("Black Mirror", 2011),
    s("Dark", 2017),
    s("Westworld - Dove tutto è concesso", 2016),
  ],
};

/** Sotto questi voti un titolo non e' "fra i piu' visti": fuori dalla lista. */
const VOTI_MINIMI = 800;

interface Pick {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string;
  /** Il fondale disegna il banner della fila del momento; la trama gli sta sotto. */
  backdropPath: string | null;
  overview: string | null;
  year: string | null;
  genreIds: number[];
  /** Numero di voti su TMDB: la fama, misurata. */
  voti: number;
  voto: number | null;
}

function annoDi(r: TmdbMovieResult | TmdbTvResult): number | null {
  const d = "title" in r ? r.release_date : r.first_air_date;
  return d ? Number(d.slice(0, 4)) : null;
}

function normalizza(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nomiDi(r: TmdbMovieResult | TmdbTvResult): string[] {
  const out: string[] = [];
  if ("title" in r) {
    out.push(r.title);
    if (r.original_title) out.push(r.original_title);
  } else {
    out.push(r.name);
    if (r.original_name) out.push(r.original_name);
  }
  return out.filter(Boolean).map(normalizza);
}

/**
 * Il risultato giusto per un seme: **prima il nome, poi l'anno, poi la fama**.
 * L'anno da solo non basta: cercando "The Ring" con l'anno 2002 il primo risultato per
 * voti era "Il Signore degli Anelli - La Compagnia dell'Anello", uscito in Italia lo
 * stesso anno. Un titolo che non contiene nemmeno le parole cercate non è quel film.
 */
function scegli<T extends TmdbMovieResult | TmdbTvResult>(
  res: T[],
  q: string,
  anno: number,
): T | null {
  const cercato = normalizza(q);
  // Punteggio, non semplice inclusione: cercando "The Ring" il titolo originale del
  // Signore degli Anelli ("...the Fellowship of the Ring") *contiene* la stringa, e con
  // un filtro binario quel film si prendeva il primo posto della lista dell'orrore.
  const punti = (r: T): number =>
    Math.max(
      ...nomiDi(r).map((n) => {
        if (n === cercato) return 3;
        if (n.startsWith(cercato) || cercato.startsWith(n)) return 2;
        if (n.includes(cercato) || cercato.includes(n)) return 1;
        return 0;
      }),
    );
  const massimo = Math.max(...res.map(punti), 0);
  const base = massimo > 0 ? res.filter((r) => punti(r) === massimo) : res;
  const perAnno = base.filter((r) => {
    const a = annoDi(r);
    return a !== null && Math.abs(a - anno) <= 2;
  });
  const lista = perAnno.length > 0 ? perAnno : base;
  return lista.sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))[0] ?? null;
}

async function risolvi(seme: Seme): Promise<Pick | null> {
  // I due rami restano separati: `search/movie` e `search/tv` hanno tipi diversi, e
  // unirli prima della scelta faceva perdere a TypeScript quale dei due sta guardando.
  const r =
    seme.tipo === "movie"
      ? scegli((await searchMovies(seme.q)).results, seme.q, seme.anno)
      : scegli((await searchTv(seme.q)).results, seme.q, seme.anno);
  if (!r || !r.poster_path) return null;
  const nome = "title" in r ? r.title : r.name;
  const a = annoDi(r);
  return {
    id: r.id,
    mediaType: seme.tipo,
    title: nome,
    posterPath: r.poster_path,
    backdropPath: r.backdrop_path ?? null,
    overview: r.overview || null,
    year: a ? String(a) : null,
    genreIds: r.genre_ids ?? [],
    voti: r.vote_count ?? 0,
    voto: r.vote_average ?? null,
  };
}

async function main() {
  const out: Record<string, Pick[]> = {};
  for (const [mood, semi] of Object.entries(SEMI)) {
    const picks: Pick[] = [];
    for (const seme of semi) {
      const p = await risolvi(seme).catch(() => null);
      if (!p) {
        console.warn(`  ! non risolto: ${seme.q} (${seme.anno})`);
        continue;
      }
      if (p.voti < VOTI_MINIMI) {
        console.warn(`  ! troppo poco visto (${p.voti} voti): ${p.title}`);
        continue;
      }
      const scarto = p.year && Math.abs(Number(p.year) - seme.anno) > 2 ? " ⚠ anno" : "";
      console.log(
        `  ${mood.padEnd(16)} ${seme.q.padEnd(46)} → ${p.title} (${p.year}) ${p.voti} voti${scarto}`,
      );
      picks.push(p);
    }
    // la fama decide l'ordine di partenza; il gusto lo ritocca a runtime
    picks.sort((a, b) => b.voti - a.voti);
    out[mood] = picks;
  }
  writeFileSync("src/data/mood-picks.json", JSON.stringify(out, null, 1) + "\n", "utf8");
  const totale = Object.values(out).reduce((n, l) => n + l.length, 0);
  console.log(`\nscritti ${totale} titoli in src/data/mood-picks.json`);
}

void main();

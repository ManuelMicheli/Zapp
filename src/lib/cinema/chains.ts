// Catene cinematografiche italiane: riconosciute dal nome, usate per il link
// biglietteria quando MovieGlu non fornisce il sito del singolo cinema.

/**
 * Marchio della catena, servito da `public/cinema/` (la CSP consente solo self:
 * un logo preso dal sito della catena a runtime sarebbe bloccato). I file vengono
 * dagli asset pubblici dei rispettivi siti, ridotti a 96px (o alti 44px per i
 * marchi in sola scritta) - uso nominativo, serve a riconoscere la sala.
 * Quadrato (`width === height`) -> tessera; scritta larga -> pillola.
 */
export interface ChainLogo {
  src: string;
  width: number;
  height: number;
}

export interface Chain {
  name: string;
  homeUrl: string;
  pattern: RegExp;
  logo?: ChainLogo;
}

export const CINEMA_CHAINS: Chain[] = [
  {
    name: "UCI Cinemas",
    homeUrl: "https://ucicinemas.it/",
    pattern: /\buci\b/i,
    logo: { src: "/cinema/uci.png", width: 96, height: 96 },
  },
  {
    name: "The Space Cinema",
    homeUrl: "https://www.thespacecinema.it/",
    pattern: /the\s*space/i,
    logo: { src: "/cinema/the-space.png", width: 96, height: 96 },
  },
  {
    name: "Notorious Cinemas",
    homeUrl: "https://www.notoriouscinemas.it/",
    pattern: /notorious/i,
    logo: { src: "/cinema/notorious.png", width: 85, height: 44 },
  },
  {
    name: "Cinelandia",
    homeUrl: "https://www.cinelandia.it/",
    pattern: /cinelandia/i,
    logo: { src: "/cinema/cinelandia.png", width: 96, height: 96 },
  },
];

export function chainFor(cinemaName: string): Chain | null {
  return CINEMA_CHAINS.find((c) => c.pattern.test(cinemaName)) ?? null;
}

export function googleTicketsUrl(cinemaName: string, filmName: string): string {
  const q = encodeURIComponent(`${cinemaName} ${filmName} biglietti`);
  return `https://www.google.com/search?q=${q}`;
}

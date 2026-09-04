// Catene cinematografiche italiane: riconosciute dal nome, usate per il link
// biglietteria quando MovieGlu non fornisce il sito del singolo cinema.

export interface Chain {
  name: string;
  homeUrl: string;
  pattern: RegExp;
}

export const CINEMA_CHAINS: Chain[] = [
  { name: "UCI Cinemas", homeUrl: "https://ucicinemas.it/", pattern: /\buci\b/i },
  {
    name: "The Space Cinema",
    homeUrl: "https://www.thespacecinema.it/",
    pattern: /the\s*space/i,
  },
  {
    name: "Notorious Cinemas",
    homeUrl: "https://www.notoriouscinemas.it/",
    pattern: /notorious/i,
  },
  { name: "Cinelandia", homeUrl: "https://www.cinelandia.it/", pattern: /cinelandia/i },
];

export function chainFor(cinemaName: string): Chain | null {
  return CINEMA_CHAINS.find((c) => c.pattern.test(cinemaName)) ?? null;
}

export function googleTicketsUrl(cinemaName: string, filmName: string): string {
  const q = encodeURIComponent(`${cinemaName} ${filmName} biglietti`);
  return `https://www.google.com/search?q=${q}`;
}

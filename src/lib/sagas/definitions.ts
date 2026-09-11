export const BOND_ACTORS = [
  "Sean Connery",
  "George Lazenby",
  "Roger Moore",
  "Timothy Dalton",
  "Pierce Brosnan",
  "Daniel Craig",
] as const;

export interface SagaDefinition {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  coverId: number;
  movieIds: number[];
  timelineIds?: number[];
  timelineDescription?: string;
  notes?: Record<number, string>;
  actors?: Record<string, number[]>;
  source: { label: string; url: string };
}

/** Sequenze editoriali: non ordinare per anno di ambientazione o collection TMDB. */
export const SAGA_DEFINITIONS: SagaDefinition[] = [
  {
    slug: "marvel",
    title: "Marvel",
    subtitle: "Universo cinematografico",
    description:
      "Dalla prima armatura di Tony Stark al multiverso. I lungometraggi MCU, in un percorso da iniziare o riscoprire. Le serie TV e i film Marvel esterni al MCU non fanno parte di questa lista.",
    coverId: 299536,
    movieIds: [
      1726, 1724, 10138, 10195, 1771, 24428, 68721, 76338, 100402, 118340, 99861, 102899,
      271110, 284052, 283995, 315635, 284053, 284054, 299536, 363088, 299537, 299534,
      429617, 497698, 566525, 524434, 634649, 453395, 616037, 505642, 640146, 447365,
      609681, 533535, 822119, 986056, 617126, 969681,
    ],
    timelineIds: [
      1771, 299537, 1726, 10138, 1724, 10195, 24428, 76338, 68721, 100402, 118340, 283995,
      99861, 102899, 271110, 497698, 284054, 315635, 284052, 284053, 363088, 299536,
      299534, 566525, 429617, 524434, 634649, 453395, 505642, 616037, 640146, 447365,
      609681, 533535, 822119, 986056, 617126,
    ],
    timelineDescription:
      "Segui gli eventi principali della storia, a partire da Captain America. È un percorso per il rewatch: flashback e scene dopo i titoli di coda possono anticipare altri film. Il multiverso non ha un'unica cronologia condivisa; le eccezioni sono indicate sui titoli.",
    notes: {
      533535:
        "Multiverso e viaggi nel tempo: questa posizione è un percorso di visione, non una data unica.",
      617126:
        "Ambientato negli anni Sessanta di un universo alternativo. In coda come nel percorso Disney+, non negli anni Sessanta della Terra principale.",
      969681:
        "Collocazione nella linea temporale da verificare: mostrato dopo il percorso già ordinato.",
    },
    source: {
      label: "Riferimento Marvel / Disney+",
      url: "https://www.marvel.com/articles/movies/mcu-timeline-order-disney-plus",
    },
  },
  {
    slug: "star-wars",
    title: "Star Wars",
    subtitle: "Una galassia, due percorsi",
    description:
      "La saga degli Skywalker e i film che ne ampliano la storia. Seguiamo la guida ufficiale di StarWars.com, selezionando i lungometraggi: incluso The Clone Wars, escluse serie, corti e speciali.",
    coverId: 11,
    movieIds: [
      11, 1891, 1892, 1893, 1894, 1895, 12180, 140607, 330459, 181808, 348350, 181812,
      1228710,
    ],
    timelineIds: [
      1893, 1894, 12180, 1895, 348350, 330459, 11, 1891, 1892, 1228710, 140607, 181808,
      181812,
    ],
    timelineDescription:
      "Segui la storia dall'Episodio I all'Episodio IX, con The Clone Wars e gli spin-off nella posizione indicata dalla guida ufficiale. L'ordine degli eventi rivela prima alcuni legami che al cinema erano una sorpresa.",
    source: {
      label: "Guida ufficiale Star Wars",
      url: "https://www.starwars.com/news/star-wars-movies-and-series-guide",
    },
  },
  {
    slug: "terra-di-mezzo",
    title: "Terra di Mezzo",
    subtitle: "Lo Hobbit e Il Signore degli Anelli",
    description:
      "I sei film di Peter Jackson: il viaggio di Bilbo e la missione della Compagnia dell'Anello. Un percorso dedicato alle due trilogie live action.",
    coverId: 120,
    movieIds: [120, 121, 122, 49051, 57158, 122917],
    timelineIds: [49051, 57158, 122917, 120, 121, 122],
    timelineDescription:
      "Parti dal viaggio di Bilbo nella trilogia de Lo Hobbit, poi accompagna Frodo ne Il Signore degli Anelli. Al cinema è arrivata prima la storia di Frodo.",
    source: { label: "Il mondo dei film", url: "https://www.lordoftherings.net/" },
  },
  {
    slug: "harry-potter",
    title: "Harry Potter",
    subtitle: "E Animali Fantastici",
    description:
      "Gli otto film di Harry Potter e i tre film di Animali Fantastici. Da Hogwarts al mondo magico di Newt Scamander.",
    coverId: 671,
    movieIds: [671, 672, 673, 674, 675, 767, 12444, 12445, 259316, 338952, 338953],
    timelineIds: [259316, 338952, 338953, 671, 672, 673, 674, 675, 767, 12444, 12445],
    timelineDescription:
      "Inizia da Animali Fantastici, ambientato decenni prima della nascita di Harry, poi prosegui con gli otto film di Harry Potter. Per uscita scopri prima Hogwarts, come il pubblico originale.",
    source: {
      label: "Il mondo magico ufficiale",
      url: "https://www.harrypotter.com/discover/films",
    },
  },
  {
    slug: "fast-furious",
    title: "Fast & Furious",
    subtitle: "La famiglia, dall'inizio",
    description:
      "Dalle corse di strada alle missioni impossibili di Dom e della sua famiglia, con lo spin-off Hobbs & Shaw. Solo lungometraggi.",
    coverId: 82992,
    movieIds: [
      9799, 584, 9615, 13804, 51497, 82992, 168259, 337339, 384018, 385128, 385687,
    ],
    timelineIds: [
      9799, 584, 13804, 51497, 82992, 9615, 168259, 337339, 384018, 385128, 385687,
    ],
    timelineDescription:
      "Tokyo Drift si sposta dopo Fast & Furious 6: così segui il percorso dei personaggi nella storia. Hobbs & Shaw si inserisce dopo l'ottavo film; i flashback restano dentro i rispettivi capitoli.",
    source: { label: "Il mondo Fast & Furious", url: "https://www.thefastsaga.com/" },
  },
  {
    slug: "the-conjuring",
    title: "The Conjuring",
    subtitle: "I casi dei Warren e le loro origini",
    description:
      "I casi di Ed e Lorraine Warren, Annabelle e The Nun: i nove film del nucleo ufficiale dell'universo, fino a Il rito finale. La Llorona non è inclusa in questo percorso.",
    coverId: 138843,
    movieIds: [138843, 250546, 259693, 396422, 439079, 521029, 423108, 968051, 1038392],
    timelineIds: [
      439079, 396422, 968051, 250546, 138843, 521029, 259693, 423108, 1038392,
    ],
    timelineDescription:
      "Parti dalle origini di The Nun, passa per Annabelle e arriva ai casi dei Warren. Conta l'ambientazione principale di ogni film: prologhi e flashback possono avvenire prima.",
    source: {
      label: "Percorso The Conjuring di Regal",
      url: "https://www.regalcineworld.com/sites/cineworld-plc/files/press-release/073125-conjuring-universe-series.pdf",
    },
  },
  {
    slug: "james-bond",
    title: "James Bond",
    subtitle: "Scegli il tuo 007",
    description:
      "I 25 film della serie ufficiale EON, da Licenza di uccidere a No Time to Die. Guarda l'evoluzione di 007 oppure scegli l'attore da cui iniziare. Esclusi Casino Royale (1967) e Mai dire mai.",
    coverId: 37724,
    movieIds: [
      646, 657, 658, 660, 667, 668, 681, 253, 682, 691, 698, 699, 700, 707, 708, 709, 710,
      714, 36643, 36669, 36557, 10764, 37724, 206647, 370172,
    ],
    actors: {
      "Sean Connery": [646, 657, 658, 660, 667, 681],
      "George Lazenby": [668],
      "Roger Moore": [253, 682, 691, 698, 699, 700, 707],
      "Timothy Dalton": [708, 709],
      "Pierce Brosnan": [710, 714, 36643, 36669],
      "Daniel Craig": [36557, 10764, 37724, 206647, 370172],
    },
    source: { label: "Filmografia ufficiale 007", url: "https://www.007.com/the-films/" },
  },
];

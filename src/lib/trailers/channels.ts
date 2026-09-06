/**
 * Canali YouTube ufficiali dei distributori da cui Zapp accetta i trailer.
 *
 * Solo questi: un trailer di terzi (fan upload, testate, canali "trailer") non diventa
 * mai fondale. `italian` distingue i canali dei distributori italiani (tutto ciò che
 * pubblicano è in italiano) dai canali globali (Netflix, MUBI, Apple TV), che caricano
 * anche trailer in altre lingue: per quelli serve la conferma della lingua.
 *
 * `id` è il channelId (UC…) usato dalla YouTube Data API; `handle` è quello di
 * `author_url` nell'oEmbed (`https://www.youtube.com/@handle`).
 */
export interface OfficialChannel {
  id: string;
  handle: string;
  name: string;
  italian: boolean;
}

export const OFFICIAL_CHANNELS: readonly OfficialChannel[] = [
  {
    id: "UCIQ5iN8wzGkKyXJeX6eR50Q",
    handle: "warnerbrositalia",
    name: "Warner Bros. Italia",
    italian: true,
  },
  {
    id: "UCpLWRKkNwJOOj_NXDobKWUQ",
    handle: "SonyPicturesIT",
    name: "Sony Pictures Italia",
    italian: true,
  },
  {
    id: "UCnQxdwiEfaRCkbIxV873N0g",
    handle: "UniversalpicturesIt",
    name: "Universal Pictures International Italy",
    italian: true,
  },
  {
    id: "UCBH4HCPqGYZ0Yr6peYP0yag",
    handle: "DisneyIT",
    name: "Disney IT",
    italian: true,
  },
  {
    id: "UClssoj08grgttJtZhsbuGRw",
    handle: "MarvelItaly",
    name: "Marvel Italia",
    italian: true,
  },
  {
    id: "UCYcreT4_hsBN-OqU8P36lRw",
    handle: "20thCenturyIT",
    name: "20th Century Studios Italia",
    italian: true,
  },
  {
    id: "UCKXXzxGD4zs3SdoJ0PWCJrQ",
    handle: "StarWarsItalia",
    name: "Star Wars Italia",
    italian: true,
  },
  {
    id: "UCAaBGiU1C74gFgRcJTivj4w",
    handle: "PrimeVideoIT",
    name: "Amazon Prime Video Italia",
    italian: true,
  },
  { id: "UCWOA1ZGywLbqmigxE4Qlvuw", handle: "Netflix", name: "Netflix", italian: false },
  {
    id: "UCi_T2R1AzOCun4-PI4Or2ng",
    handle: "netflixitalia",
    name: "Netflix Italia",
    italian: true,
  },
  { id: "UCb6-VM5UQ4Czj_d3m9EPGfg", handle: "mubi", name: "MUBI", italian: false },
  { id: "UC1Myj674wRVXB9I4c6Hm5zA", handle: "AppleTV", name: "Apple TV", italian: false },
  { id: "UCg9aAI2ueYPFemOhzXR447g", handle: "SkyItalia", name: "Sky", italian: true },
  {
    id: "UCPqpcV7Nup2R10KOKdf25hA",
    handle: "Eaglepicturesmovie",
    name: "Eagle Pictures",
    italian: true,
  },
  {
    id: "UCVBlH5eoWuuaAhy5HprJE8w",
    handle: "01distribution",
    name: "01Distribution",
    italian: true,
  },
  {
    id: "UCZ2NF3-EhyJ1LNYfQIvqJRg",
    handle: "luckyredfilm",
    name: "Lucky Red",
    italian: true,
  },
  {
    id: "UCuDqeGdhlLCmPLWAeZriz9w",
    handle: "MedusaFilmOfficial",
    name: "Medusa Film Official",
    italian: true,
  },
  {
    id: "UCAK0nfddPamAko4j1YOlkgA",
    handle: "ParamountPicturesItalia",
    name: "Paramount Pictures Italia",
    italian: true,
  },
  {
    id: "UC1HQ4tiKuLxm5xKnFl6iNsg",
    handle: "VisionDistribution",
    name: "Vision Distribution",
    italian: true,
  },
  {
    id: "UC6QuM9iiz2kLk_MdFgL5IwQ",
    handle: "IWonderPictures",
    name: "I Wonder Pictures",
    italian: true,
  },
  {
    id: "UCZtTYguRFxjn3ixlD_LAIhA",
    handle: "bimdistribuzione",
    name: "bimdistribuzione",
    italian: true,
  },
  {
    id: "UCXbgKPZ2rRMyinEGrrABelw",
    handle: "NotoriousPictures",
    name: "NotoriousPictures",
    italian: true,
  },
  {
    id: "UCYo8IZPzSjJ8idSNkYhYdMw",
    handle: "PlaionPicturesIT",
    name: "PLAION PICTURES Italia",
    italian: true,
  },
  {
    id: "UClcDIR5yxaeI-GAilhQ4O3Q",
    handle: "MidnightFactoryIT",
    name: "Midnight Factory",
    italian: true,
  },
  {
    id: "UCKUzdt2sELyxd6mz-bAx3bA",
    handle: "Rai",
    name: "Rai",
    italian: true,
  },
  {
    id: "UCqLKODDhJLmOGlLSYqFaVRA",
    handle: "Mediaset",
    name: "Mediaset Infinity",
    italian: true,
  },
  {
    id: "UCiQDSdRKaUNFV2HNeyo4W_Q",
    handle: "discoveryplusitalia",
    name: "discovery plus Italia",
    italian: true,
  },
  {
    id: "UCgw3bg9bEQBg3OW6ERQwuWw",
    handle: "ParamountPlusIT",
    name: "Paramount+ Italia",
    italian: true,
  },
  {
    id: "UCW9_z4xQB1dsz6Tm1hahM-Q",
    handle: "cartoonnetworkitalia",
    name: "Cartoon Network Italia",
    italian: true,
  },
  {
    id: "UCsHe74knLccbgec6WdGAkPQ",
    handle: "NickelodeonItalia",
    name: "Nickelodeon Italia",
    italian: true,
  },
  {
    id: "UCKVcwSWq9l6EO0PZ8641WMw",
    handle: "dynitchannel",
    name: "DYNITchannel",
    italian: true,
  },
  {
    id: "UCqPEdzcwpzX_VT-WXwpTY7w",
    handle: "AnimeFactoryIT",
    name: "Anime Factory Italia",
    italian: true,
  },
  {
    id: "UCBHRv4ZWol_TgNOvF-xa79g",
    handle: "AdlerEntertainment",
    name: "Adler Entertainment",
    italian: true,
  },
  {
    id: "UCu_fiqMKhd5-UtIiGtlsRhQ",
    handle: "TeodoraFilm",
    name: "Teodora Film",
    italian: true,
  },
  {
    id: "UCafq3DLHLi6KlvW_gHzvtnw",
    handle: "AcademyTwo",
    name: "Academy Two",
    italian: true,
  },
  {
    id: "UCNNc0KOiY5rN365iPlrHc_w",
    handle: "MoviesInspired",
    name: "MOVIESINSPIRED",
    italian: true,
  },
  {
    id: "UCZZwY7D-D8NgArjmRH8yjYw",
    handle: "WantedCinema",
    name: "Wanted Cinema",
    italian: true,
  },
  {
    id: "UCeWzte2dR3JMxhDgv-PWqTw",
    handle: "CGEntertainment",
    name: "CG Entertainment",
    italian: true,
  },
  {
    id: "UCi1KSLoeAe0bbB1FWCxLiNQ",
    handle: "OfficineUBU",
    name: "Officine UBU",
    italian: true,
  },
  {
    id: "UCDGQFx6YiAF0s7HssXm6hOg",
    handle: "LeoneFilmGroup",
    name: "Leone Film Group",
    italian: true,
  },
  // canali globali: trailer in molte lingue, serve la conferma dell'italiano
  {
    id: "UCGie8GMlUo3kBKIopdvumVQ",
    handle: "StillWatchingNetflix",
    name: "Still Watching Netflix",
    italian: false,
  },
  {
    id: "UCBSs9x2KzSLhyyA9IKyt4YA",
    handle: "NetflixAnime",
    name: "Netflix Anime",
    italian: false,
  },
  {
    id: "UCQJWtTnAHhEG5w4uN0udnUQ",
    handle: "primevideo",
    name: "Prime Video",
    italian: false,
  },
  {
    id: "UC6pGDc4bFGD1_36IKv3FnYg",
    handle: "Crunchyroll",
    name: "Crunchyroll",
    italian: false,
  },
];

const BY_ID = new Map(OFFICIAL_CHANNELS.map((c) => [c.id, c]));
const BY_HANDLE = new Map(OFFICIAL_CHANNELS.map((c) => [c.handle.toLowerCase(), c]));
const BY_NAME = new Map(OFFICIAL_CHANNELS.map((c) => [normalizeName(c.name), c]));

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isOfficialChannelId(id: string | undefined | null): boolean {
  return Boolean(id) && BY_ID.has(id as string);
}

export function getOfficialChannel(id: string): OfficialChannel | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Canale dei dati oEmbed di YouTube (`author_url`, `author_name`): prima l'handle
 * dell'url (stabile), poi il nome visualizzato. Null se non è un canale ufficiale.
 */
export function matchOfficialChannel(input: {
  authorUrl: string | undefined | null;
  authorName: string | undefined | null;
}): OfficialChannel | null {
  const handle = input.authorUrl?.match(/\/@([^/?#]+)/)?.[1];
  if (handle) {
    const byHandle = BY_HANDLE.get(decodeURIComponent(handle).toLowerCase());
    if (byHandle) return byHandle;
  }
  if (input.authorName) {
    const byName = BY_NAME.get(normalizeName(input.authorName));
    if (byName) return byName;
  }
  return null;
}

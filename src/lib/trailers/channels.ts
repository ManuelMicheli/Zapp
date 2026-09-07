/**
 * Canali YouTube ufficiali di studi, distributori e piattaforme da cui Zapp accetta i
 * trailer.
 *
 * Solo questi: un trailer di terzi (fan upload, testate, canali "trailer", agenzie
 * stampa) non diventa mai fondale. L'allowlist serve sia ai trailer italiani sia al
 * ripiego in inglese, quindi comprende anche i canali globali degli studi; resta
 * **scritta a mano**, nessun canale entra da solo. La lista di partenza è il censimento
 * dei canali che ospitano i trailer del catalogo, versionato in
 * `docs/design/data/youtube-channel-census.txt`.
 *
 * `italian` distingue i canali dei distributori italiani (tutto ciò che pubblicano è in
 * italiano) dai canali globali (Netflix, Warner Bros., Apple TV), che caricano anche
 * trailer in altre lingue: per quelli serve la conferma della lingua.
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
  // distributori italiani emersi dal censimento dei canali (docs/design/data)
  {
    id: "UCLP1KayQF-YaYdWPFubTlxQ",
    handle: "appleitalia",
    name: "Apple Italia",
    italian: true,
  },
  {
    id: "UC1j1ECCSR0I_jSBccIJqiSQ",
    handle: "dwaitaly",
    name: "DreamWorks Animation Italy",
    italian: true,
  },
  {
    id: "UCPtac2zD4xBEEstyBmnEHXg",
    handle: "notoriousitalia",
    name: "NOTORIOUS Pictures",
    italian: true,
  },
  {
    id: "UCeFautROnN7evdkwrsBfNZw",
    handle: "nexostudiosit",
    name: "Nexo Studios",
    italian: true,
  },
  {
    id: "UC8IZGhNDmoqldaYQa1DfglA",
    handle: "piperfilm.official",
    name: "PiperFilm",
    italian: true,
  },
  {
    id: "UCNT5YLfnn2cQGIxGw8iOxJQ",
    handle: "filmandclips",
    name: "Film&Clips",
    italian: true,
  },
  // canali globali: trailer in molte lingue, serve la conferma dell'italiano
  {
    id: "UCQzdMyuz0Lf4zo4uGcEujFw",
    handle: "gameofthrones",
    name: "GameofThrones",
    italian: false,
  },
  {
    id: "UCPgMAS8woHJ_o_OZdTR7kcQ",
    handle: "peacock",
    name: "Peacock",
    italian: false,
  },
  {
    id: "UCP7i-E6AYr-UChpNcO0EEag",
    handle: "primevideolatinoamerica",
    name: "Prime Video Latinoamerica",
    italian: false,
  },
  {
    id: "UCMw2QZuFUZxfFAFZ0hOLrZg",
    handle: "netflixthailand",
    name: "Netflix Thailand",
    italian: false,
  },
  {
    id: "UCzi3g9ade6lq-nGjShQOJJg",
    handle: "africaonnetflix",
    name: "AfricaOnNetflix",
    italian: false,
  },
  {
    id: "UCTMoFozMX_0KlRmRxoFXtrg",
    handle: "eurekaentertainment",
    name: "Eureka Entertainment",
    italian: false,
  },
  {
    id: "UCO7rKYuE7EMHYFcwP-obqhg",
    handle: "gravitasventuresvod",
    name: "Gravitas Ventures",
    italian: false,
  },
  {
    id: "UCJ5v_MCY6GNUBTO8-D3XoAg",
    handle: "wwe",
    name: "WWE",
    italian: false,
  },
  {
    id: "UCjmJDM5pRKbUlVIzDYYWb6g",
    handle: "warnerbros",
    name: "Warner Bros.",
    italian: false,
  },
  {
    id: "UCgKkNPU2Ib7_TcyAl8M2S-w",
    handle: "warnerbrosentertainment",
    name: "Warner Bros. Entertainment",
    italian: false,
  },
  {
    id: "UCsQQo8qb62ikp9kc954V7eQ",
    handle: "warnerbrosrewind",
    name: "Warner Bros. Rewind",
    italian: false,
  },
  {
    id: "UCbxjDfYwfF8RjYBp5htJ38Q",
    handle: "warnerbrosuktrailers",
    name: "Warner Bros. UK & Ireland",
    italian: false,
  },
  {
    id: "UC2FrJXBb3WVAKZ8jpxkZxlA",
    handle: "warnerbrosindia",
    name: "Warner Bros. India",
    italian: false,
  },
  {
    id: "UChV8dpQWLtgXL8WonWxoaoA",
    handle: "warnerbrosth",
    name: "Warner Bros. Thailand",
    italian: false,
  },
  {
    id: "UC2D1KZT7nWltNOMufvHB8OQ",
    handle: "warnerbrossg",
    name: "Warner Bros. Singapore",
    italian: false,
  },
  {
    id: "UCqaBNLFr-h-o_q3bV-n4lHQ",
    handle: "warnerbrosph",
    name: "Warner Bros. Philippines",
    italian: false,
  },
  {
    id: "UCz97F7dMxBNOfGYu3rx8aCw",
    handle: "sonypictures",
    name: "Sony Pictures Entertainment",
    italian: false,
  },
  {
    id: "UCZbzIn7mumz5Ct-uTC0dZPg",
    handle: "sonypicturescanada",
    name: "Sony Pictures Canada",
    italian: false,
  },
  {
    id: "UCJJap_3RGZ2UxqLTLz0K39g",
    handle: "sonypicsuk",
    name: "Sony Pictures Releasing UK",
    italian: false,
  },
  {
    id: "UCQ2zp9FmJzOG_JzUJ0A-FlQ",
    handle: "sonypicturesaus",
    name: "Sony Pictures Releasing Australia",
    italian: false,
  },
  {
    id: "UCR9s4vEBGZTxvpD8E6XzdBw",
    handle: "sonypicturessg",
    name: "Sony Pictures Singapore",
    italian: false,
  },
  {
    id: "UCFqyJFbsV-uEcosvNhg0PaQ",
    handle: "sonypicturesindia",
    name: "Sony Pictures India",
    italian: false,
  },
  {
    id: "UCruD_lL-5fmllpKMSL-yCyQ",
    handle: "sonypicturesclassics",
    name: "Sony Pictures Classics",
    italian: false,
  },
  {
    id: "UCqH2YMSzMaGN92Vc3VkhWnQ",
    handle: "sonypicsathome",
    name: "Sony Pics at Home",
    italian: false,
  },
  {
    id: "UC9vXJYvgswrEHfNveILWM2Q",
    handle: "columbiapicturesphilippines",
    name: "ColumbiaPicturesPH",
    italian: false,
  },
  {
    id: "UCq0OueAsdxH6b8nyAspwViw",
    handle: "universalpictures",
    name: "Universal Pictures",
    italian: false,
  },
  {
    id: "UCQLBOKpgXrSj3nPU-YC3K9Q",
    handle: "universalpicturesuk",
    name: "Universal Pictures UK",
    italian: false,
  },
  {
    id: "UCIHg3K4EaY-ziWc5CyzWAzQ",
    handle: "unipicsathome",
    name: "Universal Pictures At Home",
    italian: false,
  },
  {
    id: "UCaXXlHmP4mFbPmJOnYR85Vw",
    handle: "universalpicsza",
    name: "Universal Pictures South Africa",
    italian: false,
  },
  {
    id: "UCobkbYYx90aDf_oMxwni0bQ",
    handle: "universalpicturesindia",
    name: "Universal Pictures India",
    italian: false,
  },
  {
    id: "UCY26xU0-avwTJ6F6TzUZVEw",
    handle: "universalkids",
    name: "Universal Kids",
    italian: false,
  },
  {
    id: "UCF9imwPMSGz4Vq1NiTWCC7g",
    handle: "paramountpictures",
    name: "Paramount Pictures",
    italian: false,
  },
  {
    id: "UCi_iW2lqB3ADsJOobe_8yeg",
    handle: "paramountpicturesuk",
    name: "Paramount Pictures UK",
    italian: false,
  },
  {
    id: "UCBe2XSKXLVOUn6U3RdYJuxA",
    handle: "paramountpicturesau",
    name: "Paramount Pictures Australia",
    italian: false,
  },
  {
    id: "UCvnm_PY4H-kFy4gyonx3Fvg",
    handle: "paramountintl",
    name: "Paramount Pictures International",
    italian: false,
  },
  {
    id: "UCsZ7igjHZB-5k8DDM7ilVJw",
    handle: "paramountpicsphilippines",
    name: "Paramount Pictures Philippines",
    italian: false,
  },
  {
    id: "UC9YHyj7QSkkSg2pjQ7M8Khg",
    handle: "paramountmovies",
    name: "Paramount Movies",
    italian: false,
  },
  {
    id: "UCrRttZIypNTA1Mrfwo745Sg",
    handle: "paramountplus",
    name: "Paramount Plus",
    italian: false,
  },
  {
    id: "UC2-BeLxzUBSs0uSrmzWhJuQ",
    handle: "20thcenturystudios",
    name: "20th Century Studios",
    italian: false,
  },
  {
    id: "UCzBay5naMlbKZicNqYmAQdQ",
    handle: "20thcenturyuk",
    name: "20th Century Studios UK",
    italian: false,
  },
  {
    id: "UC3Ar-F2egFV2qRkwEulbslg",
    handle: "20thcenturystudiossg",
    name: "20th Century Studios Singapore",
    italian: false,
  },
  {
    id: "UC-JrjBL_iZAn5wjEsw9nRYA",
    handle: "20thcenturystudiosph",
    name: "20th Century Studios Philippines",
    italian: false,
  },
  {
    id: "UC_5niPa-d35gg88HaS7RrIw",
    handle: "disney",
    name: "Disney",
    italian: false,
  },
  {
    id: "UCQphRgAhj5UxktrQNP3WF5g",
    handle: "disneyuk",
    name: "Disney UK",
    italian: false,
  },
  {
    id: "UCIrgJInjLS2BhlHOMDW7v0g",
    handle: "disneyplus",
    name: "Disney Plus",
    italian: false,
  },
  {
    id: "UC_976xMxPgzIa290Hqtk-9g",
    handle: "disneyanimation",
    name: "Walt Disney Animation Studios",
    italian: false,
  },
  {
    id: "UCsanMaRrA75morrv-dUFFuw",
    handle: "waltdisneystudiossg",
    name: "Walt Disney Studios Singapore",
    italian: false,
  },
  {
    id: "UC_IRYSp4auq7hKLvziWVH6w",
    handle: "pixar",
    name: "Pixar",
    italian: false,
  },
  {
    id: "UCvC4D8onUfXzvjTOM-dBfEA",
    handle: "marvel",
    name: "Marvel Entertainment",
    italian: false,
  },
  {
    id: "UCiifkYAs_bq1pt_zbNAzYGg",
    handle: "dcofficial",
    name: "DC",
    italian: false,
  },
  {
    id: "UCZGYJFUizSax-yElQaFDp5Q",
    handle: "starwars",
    name: "Star Wars",
    italian: false,
  },
  {
    id: "UCJ6nMHaJPZvsJ-HmUmj1SeA",
    handle: "lionsgatemovies",
    name: "Lionsgate Movies",
    italian: false,
  },
  {
    id: "UCawPtEUr4iGIU95UaKNIaFQ",
    handle: "lionsgateentertainmentcanada",
    name: "Lionsgate Canada",
    italian: false,
  },
  {
    id: "UCQ2QDEN5wRiSJQXMAXRmwHg",
    handle: "lionsgateuk",
    name: "LionsgateFilmsUK",
    italian: false,
  },
  {
    id: "UCf5CjDJvsFvtVIhkfmKAwAA",
    handle: "amazonmgmstudios",
    name: "Amazon MGM Studios",
    italian: false,
  },
  {
    id: "UCuPivVjnfNo4mb3Oog_frZg",
    handle: "a24",
    name: "A24",
    italian: false,
  },
  {
    id: "UCU4SM3j_9TNWaSu8KdGV50g",
    handle: "focusfeatures",
    name: "Focus Features",
    italian: false,
  },
  {
    id: "UCor9rW6PgxSQ9vUPWQdnaYQ",
    handle: "searchlightpictures",
    name: "SearchlightPictures",
    italian: false,
  },
  {
    id: "UCpy5dRhZd-JbZP4NsrnLt1w",
    handle: "neonrated",
    name: "NEON",
    italian: false,
  },
  {
    id: "UCq7OHvWO6Z3u-LztFdrcU-g",
    handle: "illumination",
    name: "Illumination",
    italian: false,
  },
  {
    id: "UCPEQSSaBSXq7hmh2LY2HuWg",
    handle: "amblin_entertainment",
    name: "Amblin Entertainment",
    italian: false,
  },
  {
    id: "UCAVadSTSh382kte-fQHqMNw",
    handle: "legendary",
    name: "Legendary",
    italian: false,
  },
  {
    id: "UCFSILgKCKo35QYGz8Kob51g",
    handle: "studiocanaluk",
    name: "StudiocanalUK",
    italian: false,
  },
  {
    id: "UCLOi9fGe5EdPfquSe1RS5aA",
    handle: "imaxmovies",
    name: "IMAX",
    italian: false,
  },
  {
    id: "UCSAexy0-lgubAz-JpyGKGSA",
    handle: "fathom_entertainment",
    name: "Fathom Entertainment",
    italian: false,
  },
  {
    id: "UCx-KWLTKlB83hDI6UKECtJQ",
    handle: "hbomax",
    name: "HBO Max",
    italian: false,
  },
  {
    id: "UCVTQuK2CaWaTgSsoNkn5AiQ",
    handle: "hbo",
    name: "HBO",
    italian: false,
  },
  {
    id: "UCE5mQnNl8Q4H2qcv4ikaXeA",
    handle: "hulu",
    name: "Hulu",
    italian: false,
  },
  {
    id: "UC2dIDJBf9W88PxGm-uHZPaQ",
    handle: "fxnetworks",
    name: "FX Networks",
    italian: false,
  },
  {
    id: "UC1DZpQ2DDExws9Zvl7UcSkg",
    handle: "tnt",
    name: "TNT",
    italian: false,
  },
  {
    id: "UCmxURUIJXKnoC7_i1fPhs7Q",
    handle: "amcplus",
    name: "amc+",
    italian: false,
  },
  {
    id: "UCxw5iQs7tt4qbcLa31shZ7Q",
    handle: "skytv",
    name: "Sky TV",
    italian: false,
  },
  {
    id: "UCCj956IF62FbT7Gouszaj9w",
    handle: "bbc",
    name: "BBC",
    italian: false,
  },
  {
    id: "UCdHkLMxTYwV66Sky1xXVrxQ",
    handle: "bbcamerica",
    name: "BBC America",
    italian: false,
  },
  {
    id: "UCpiCK8c6PBktcxq7Az_t4RQ",
    handle: "netflixkcontent",
    name: "Netflix K-Content",
    italian: false,
  },
  {
    id: "UCVi2lI40LetxLBKn-rtWC3A",
    handle: "crunchyrolldubs",
    name: "Crunchyroll Dubs",
    italian: false,
  },
  {
    id: "UCDb0peSmF5rLX7BvuTcJfCw",
    handle: "aniplexusa",
    name: "Aniplex USA",
    italian: false,
  },
  {
    id: "UCb9ME2w6Y_4jChUVlWdltVg",
    handle: "gkidstv",
    name: "GKIDS Films",
    italian: false,
  },
  {
    id: "UCvE8nyjdQG0_rgx9u3oqadw",
    handle: "wellgousa",
    name: "Well Go USA Entertainment",
    italian: false,
  },
  {
    id: "UClt5Bst8Ji05dZvTUdnO85g",
    handle: "openroadfilms",
    name: "Open Road Films",
    italian: false,
  },
  {
    id: "UCtlp8d4cZg2eMrVbq7vxg9w",
    handle: "stxfilms",
    name: "STXfilms",
    italian: false,
  },
  {
    id: "UCFjJTuHmTS7S26lAUwRSQ1Q",
    handle: "blackbearuk",
    name: "Black Bear UK",
    italian: false,
  },
  {
    id: "UCnLF1F3-SWsuSJEh1qIJS9w",
    handle: "blackbearpics",
    name: "Black Bear",
    italian: false,
  },
  {
    id: "UCbSLyYJPI_GlOBlDrUmnesQ",
    handle: "signatureuk",
    name: "Signature Entertainment",
    italian: false,
  },
  {
    id: "UC3GIDBVwW7-E2lQrIUiHeYA",
    handle: "eoneuk",
    name: "eOne UK",
    italian: false,
  },
  {
    id: "UCclfb8zdNbA1AE61ojCSKDA",
    handle: "entertainmentfilmdistributors",
    name: "Entertainment Film Distributors",
    italian: false,
  },
  {
    id: "UCpR3kmSyTYszJHWEcmpcnFQ",
    handle: "vertical_official",
    name: "Vertical",
    italian: false,
  },
  {
    id: "UCneoi6WTgRjMh4otvpwzv8w",
    handle: "magnoliapics",
    name: "Magnolia Pictures",
    italian: false,
  },
  {
    id: "UCafnP6JPjVq8AahYaThUelg",
    handle: "bleeckerstfilms",
    name: "Bleecker Street",
    italian: false,
  },
  {
    id: "UCOn923UnbV8H9zo_lO6ZCRw",
    handle: "independentfilmcompany",
    name: "Independent Film Company",
    italian: false,
  },
  {
    id: "UCQIjTyWmLEdsfqMQay0yGMA",
    handle: "angelstudiosinc",
    name: "Angel Studios",
    italian: false,
  },
  {
    id: "UC4dxuuIdFfGrYN3W9QDDFSg",
    handle: "iconfilmdistribution",
    name: "Icon Film Distribution",
    italian: false,
  },
  {
    id: "UCGmqALkj6Zij2PNcvpHLVZg",
    handle: "arrow_video",
    name: "Arrow Video",
    italian: false,
  },
  {
    id: "UCpHaAKu74UHvcYCi2g_PvBQ",
    handle: "shoutstudios",
    name: "Shout! Studios",
    italian: false,
  },
  {
    id: "UCuF-f_kairxTjOyHSItrmtg",
    handle: "madmanfilms",
    name: "Madman Films",
    italian: false,
  },
  {
    id: "UCA6QL2zbGrskJ0ur6MKpDAg",
    handle: "palacefilms",
    name: "PalaceFilms",
    italian: false,
  },
  {
    id: "UCBgYZngXEswPgKht9CQhWvg",
    handle: "parkcircusfilms",
    name: "Park Circus",
    italian: false,
  },
  {
    id: "UCfNROWwwASS1Zwy7s0Xyu6A",
    handle: "europacorpus",
    name: "EuropaCorp",
    italian: false,
  },
  {
    id: "UCJCx8aQrdx_ueXPmxTD2odQ",
    handle: "thefastsaga",
    name: "The Fast Saga",
    italian: false,
  },
  {
    id: "UCP8AC-LXl5Jmp64IRIsdacg",
    handle: "spiderman",
    name: "Spider-Man",
    italian: false,
  },
  {
    id: "UCgjxQJ6TlKqhHax8742ZMdA",
    handle: "avatarofficial",
    name: "Avatar",
    italian: false,
  },
  {
    id: "UCewqQ8IxAwhaUDky4-x5m1g",
    handle: "ghostbusters",
    name: "Ghostbusters",
    italian: false,
  },
  {
    id: "UCNatfVBKJwMgTBlQ_T6zaMA",
    handle: "tmntmovie",
    name: "TMNT Movie",
    italian: false,
  },
  {
    id: "UCjvqqA-Eogozfm244OhUESw",
    handle: "thehungergamesmovies",
    name: "The Hunger Games",
    italian: false,
  },
  {
    id: "UCe9DTWmhhxeKyYHL4mldGcA",
    handle: "cobrakai",
    name: "Karate Kid & Cobra Kai",
    italian: false,
  },
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

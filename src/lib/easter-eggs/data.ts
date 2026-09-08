/**
 * Le chicche: quando un film o una serie ne cita un'altra, la citazione compare
 * in fondo alla scheda del titolo citato **sotto forma di recensione**, firmata
 * dal personaggio che l'ha detta — stessa forma delle recensioni vere (avatar,
 * voto, corpo, footer), ma con la pillola "chicca" e la firma dell'opera, così
 * non si confonde con la recensione di un utente in carne e ossa.
 *
 * Tre regole per entrare.
 *
 * 1. **La battuta è vera.** `quote` è verificata su una fonte (script, IMDb, wiki
 *    della serie) e tradotta in italiano. Niente aneddoti "si dice che", niente
 *    citazioni ricostruite a memoria: se non si trova, non entra.
 * 2. **Il resto della recensione è in voce del personaggio.** `review` è scritto
 *    da noi attorno alla battuta e **deve contenerla parola per parola** (un test
 *    lo verifica); in pagina la battuta è l'unico pezzo in evidenza, il contorno
 *    resta in grigio. `rating` è il voto che quel personaggio darebbe: Fantozzi 1
 *    alla Corazzata, Cartman 10 alla Passione.
 * 3. **Si devono capire tutt'e due le opere**, e capire qui: una chicca sotto un
 *    titolo che nessuno apre non la vede nessuno, e una firmata da una serie mai
 *    arrivata in Italia non fa ridere. Per questo sono cadute Spaced, Seinfeld,
 *    Flash Gordon e MacGyver, che pure avevano la battuta giusta.
 *
 * `speaker.personId` è l'id TMDB dell'interprete: la faccia dell'avatar viene da
 * lì (`person/{id}` → `profile_path`). Per i personaggi animati resta `null` e
 * l'avatar scende sull'iniziale.
 */
export type ChiccaMediaType = "movie" | "tv";

export interface Chicca {
  /** Il titolo sotto cui compare la chicca: quello *di cui si parla*. */
  target: { mediaType: ChiccaMediaType; tmdbId: number };
  /** Chi firma la recensione. */
  speaker: { name: string; personId: number | null };
  /** Il voto in voce del personaggio, 1–10 come quelli veri. */
  rating: number;
  /** La battuta verificata, parola per parola. */
  quote: string;
  /** Il corpo della recensione: contiene `quote` e ci costruisce attorno. */
  review: string;
  /** L'opera in cui la battuta viene detta. */
  source: {
    mediaType: ChiccaMediaType;
    tmdbId: number;
    label: string;
    /** Stagione, se la battuta è di una serie e si sa quale: porta alla sua pagina. */
    season?: number;
    /** Episodio dentro la stagione, solo se verificato. */
    episode?: number;
    /** Nome dell'episodio, dove è più riconoscibile del numero. */
    episodeTitle?: string;
  };
}

export const CHICCHE: Chicca[] = [
  {
    target: { mediaType: "movie", tmdbId: 85 }, // I predatori dell'arca perduta
    speaker: { name: "Amy Farrah Fowler", personId: 167640 },
    rating: 4,
    quote:
      "Indiana Jones non ha alcun ruolo nell'esito della storia. Se non fosse nel film, finirebbe esattamente allo stesso modo.",
    review:
      "Prima di dirlo mi sono guardata l'intero film una seconda volta, per correttezza. Indiana Jones non ha alcun ruolo nell'esito della storia. Se non fosse nel film, finirebbe esattamente allo stesso modo. I nazisti trovano l'arca, la aprono e muoiono. Con lui o senza di lui. Resta un film godibile, ma il protagonista è ornamentale.",
    source: {
      mediaType: "tv",
      tmdbId: 1418,
      label: "The Big Bang Theory",
      season: 7,
      episode: 4,
    },
  },
  {
    target: { mediaType: "movie", tmdbId: 120 }, // Il Signore degli Anelli - La Compagnia dell'Anello
    speaker: { name: "Sheldon Cooper", personId: 5374 },
    rating: 10,
    quote: "Dateci il tesssoro.",
    review:
      "Abbiamo comprato una scatola di cimeli per sessanta dollari e dentro c'era un anello originale della produzione. Da quel momento non sono più del tutto me stesso. Dateci il tesssoro. Chiedo scusa. Capolavoro assoluto, ma non prestatemi niente.",
    source: {
      mediaType: "tv",
      tmdbId: 1418,
      label: "The Big Bang Theory",
      season: 3,
      episode: 17,
    },
  },
  {
    target: { mediaType: "movie", tmdbId: 11 }, // Guerre stellari
    speaker: { name: "Marshall Eriksen", personId: 41088 },
    rating: 10,
    quote:
      "Star Wars è il film preferito di Ted da sempre. Che a Stella piaccia o no conta eccome: è il test di quanto siete compatibili.",
    review:
      "Star Wars è il film preferito di Ted da sempre. Che a Stella piaccia o no conta eccome: è il test di quanto siete compatibili. Non è fanatismo, è metodo. Chi finge di adorarlo per due ore poi finge per trent'anni.",
    source: {
      mediaType: "tv",
      tmdbId: 1100,
      label: "How I Met Your Mother",
      season: 4,
      episode: 1,
    },
  },
  {
    target: { mediaType: "movie", tmdbId: 578 }, // Lo squalo
    speaker: { name: "Marty McFly", personId: 521 },
    rating: 8,
    quote: "Lo squalo sembra ancora finto.",
    review:
      "Nel 2015 ne hanno fatti diciannove. Il diciannovesimo è in olografia: mi è saltato addosso in mezzo alla strada e mi sono preso uno spavento vero. Poi però l'ho guardato bene. Lo squalo sembra ancora finto. L'originale resta l'originale.",
    source: { mediaType: "movie", tmdbId: 165, label: "Ritorno al futuro - Parte II" },
  },
  {
    target: { mediaType: "movie", tmdbId: 694 }, // Shining
    speaker: { name: "Willie il giardiniere", personId: null },
    rating: 9,
    quote: "Zitto! Vuoi che ci facciano causa?",
    review:
      "Ho spiegato al ragazzo che ce l'ha anche lui, il dono: lo shinning, con due N. Lui mi ha corretto dicendo che si scrive in un altro modo. Zitto! Vuoi che ci facciano causa? Comunque sì: gran film, e quel padre non finisce bene.",
    source: {
      mediaType: "tv",
      tmdbId: 456,
      label: "I Simpson",
      season: 6,
      episode: 6,
      episodeTitle: "La paura fa novanta V",
    },
  },
  {
    target: { mediaType: "movie", tmdbId: 70 }, // Million Dollar Baby
    speaker: { name: "Michael Scott", personId: 4495 },
    rating: 9,
    quote: "Meryl Streep è la cattiva. Non te lo aspetti.",
    review:
      "Ve lo racconto senza rovinarvelo, tranquilli. Meryl Streep è la cattiva. Non te lo aspetti. Un pugno nello stomaco. L'ho detto a Pam per prepararla e adesso non mi rivolge la parola, non ho capito bene perché.",
    source: {
      mediaType: "tv",
      tmdbId: 2316,
      label: "The Office",
      season: 4,
      episodeTitle: "Money",
    },
  },
  {
    target: { mediaType: "movie", tmdbId: 238 }, // Il padrino
    speaker: { name: "Joe Fox", personId: 31 },
    rating: 10,
    quote:
      "Il Padrino è l'I Ching. Il Padrino è la somma di ogni saggezza. Il Padrino è la risposta a qualunque domanda.",
    review:
      "Il Padrino è l'I Ching. Il Padrino è la somma di ogni saggezza. Il Padrino è la risposta a qualunque domanda. Cosa metto in valigia per le vacanze? Lascia la pistola, prendi i cannoli. Ti hanno appena dichiarato guerra? Vai al materasso. Ripetitelo ogni volta che una cosa ti sembra personale: non è personale, sono affari.",
    source: { mediaType: "movie", tmdbId: 9489, label: "C'è post@ per te" },
  },
  {
    target: { mediaType: "movie", tmdbId: 242 }, // Il padrino - Parte III
    speaker: { name: "Silvio Dante", personId: 107622 },
    rating: 6,
    quote: "Proprio quando pensavo di esserne fuori, mi ci tirano dentro di nuovo!",
    review:
      "Lo so cosa pensate: il terzo è il più debole dei tre. D'accordo. Ma c'è quella scena, e quella scena vale il biglietto. Proprio quando pensavo di esserne fuori, mi ci tirano dentro di nuovo! La rifaccio da vent'anni e ancora non mi stanca. Agli altri sì, a me no.",
    source: { mediaType: "tv", tmdbId: 1398, label: "I Soprano" },
  },
  {
    target: { mediaType: "movie", tmdbId: 562 }, // Trappola di cristallo
    speaker: { name: "Joey Tribbiani", personId: 14407 },
    rating: 10,
    quote: "Sì, ma se lo guardiamo una seconda volta allora è Die Hard 2!",
    review:
      "Avevo promesso una serata doppia e sono tornato con due videocassette dello stesso film. Chandler se n'è accorto. Sì, ma se lo guardiamo una seconda volta allora è Die Hard 2! Quindi in una sera ne abbiamo visti due. È matematica.",
    source: {
      mediaType: "tv",
      tmdbId: 1668,
      label: "Friends",
      season: 7,
      episode: 6,
    },
  },
  {
    target: { mediaType: "movie", tmdbId: 111 }, // Scarface
    speaker: { name: "Walter White", personId: 17419 },
    rating: 8,
    quote: "Muoiono tutti, in questo film.",
    review:
      "L'ho rimesso su l'altra sera. Mio figlio sul divano, la bambina in braccio, e questo sullo schermo. Muoiono tutti, in questo film. Non è una critica. È esattamente il punto, ed è per questo che continuo a riguardarlo.",
    source: {
      mediaType: "tv",
      tmdbId: 1396,
      label: "Breaking Bad",
      season: 5,
    },
  },
  {
    target: { mediaType: "movie", tmdbId: 643 }, // La corazzata Potëmkin
    speaker: { name: "Ugo Fantozzi", personId: 27433 },
    rating: 1,
    quote: "La corazzata Kotiomkin è una cagata pazzesca!",
    review:
      "Ce l'hanno fatta vedere centoventotto volte, in azienda, e ogni volta bisognava applaudire. Poi mi sono alzato e l'ho detto. La corazzata Kotiomkin è una cagata pazzesca! Novantadue minuti di applausi. Non aggiungo altro: ho già dato.",
    source: { mediaType: "movie", tmdbId: 37769, label: "Il secondo tragico Fantozzi" },
  },
  {
    target: { mediaType: "movie", tmdbId: 948 }, // Halloween - La notte delle streghe
    speaker: { name: "Randy Meeks", personId: 6213 },
    rating: 10,
    quote:
      "Ci sono delle regole da rispettare, se vuoi sopravvivere a un film horror. Uno: mai fare sesso. Due: mai bere e mai drogarsi. Tre: mai, per nessun motivo, dire «torno subito».",
    review:
      "Questo film non è solo un film: è il manuale. Ci sono delle regole da rispettare, se vuoi sopravvivere a un film horror. Uno: mai fare sesso. Due: mai bere e mai drogarsi. Tre: mai, per nessun motivo, dire «torno subito». Le ha scritte tutte lui. Rispettale e arrivi ai titoli di coda.",
    source: { mediaType: "movie", tmdbId: 4232, label: "Scream" },
  },
  {
    target: { mediaType: "movie", tmdbId: 1892 }, // Il ritorno dello Jedi
    speaker: { name: "Randal Graves", personId: 23630 },
    rating: 5,
    quote:
      "Tutti quegli operai innocenti, assunti solo per fare un lavoro, morti ammazzati. Vittime di una guerra che non li riguardava.",
    review:
      "Nessuno lo dice mai, ma la seconda Morte Nera era un cantiere aperto: idraulici, lattonieri, carpentieri. Tutti quegli operai innocenti, assunti solo per fare un lavoro, morti ammazzati. Vittime di una guerra che non li riguardava. Alla fine i ribelli ballano con gli Ewok. Io no.",
    source: { mediaType: "movie", tmdbId: 2292, label: "Clerks - Commessi" },
  },
  {
    target: { mediaType: "movie", tmdbId: 289 }, // Casablanca
    speaker: { name: "Sally Albright", personId: 5344 },
    rating: 9,
    quote:
      "Le donne sono pratiche, perfino Ingrid Bergman: ecco perché alla fine del film sale su quell'aereo.",
    review:
      "Harry sostiene che nessuna donna sana di mente lascerebbe l'uomo con cui è stata meglio in vita sua. Sbagliato. Le donne sono pratiche, perfino Ingrid Bergman: ecco perché alla fine del film sale su quell'aereo. Il finale è quello giusto, e sono stufa di doverlo spiegare in macchina.",
    source: { mediaType: "movie", tmdbId: 639, label: "Harry, ti presento Sally..." },
  },
  {
    target: { mediaType: "movie", tmdbId: 44912 }, // Lanterna verde
    speaker: { name: "Wade Wilson", personId: 10859 },
    rating: 2,
    quote: "E per favore, non fate la tuta verde. E nemmeno animata.",
    review:
      "Un consiglio a chiunque stia per girare un film di supereroi, offerto gratuitamente e con il cuore in mano. E per favore, non fate la tuta verde. E nemmeno animata. Conosco uno che ci è passato. Non si è più ripreso del tutto.",
    source: { mediaType: "movie", tmdbId: 293660, label: "Deadpool" },
  },
  {
    target: { mediaType: "movie", tmdbId: 8920 }, // Garfield - Il film
    speaker: { name: "Bill Murray", personId: 1532 },
    rating: 3,
    quote: "Garfield, forse.",
    review:
      "Mi hanno sparato per sbaglio in casa mia, in piena apocalisse, e mentre me ne andavo mi hanno chiesto se avessi dei rimpianti. Garfield, forse. Erano le mie ultime parole: prendetele sul serio.",
    source: { mediaType: "movie", tmdbId: 19908, label: "Benvenuti a Zombieland" },
  },
  {
    target: { mediaType: "movie", tmdbId: 615 }, // La passione di Cristo
    speaker: { name: "Eric Cartman", personId: null },
    rating: 10,
    quote: "L'ho visto trentaquattro volte.",
    review:
      "L'ho visto trentaquattro volte. Trentaquattro. Voi quante? Intanto Stan e Kenny sono andati fino in Malibu a farsi ridare diciotto dollari da Mel Gibson, il che dice tutto sul loro livello.",
    source: {
      mediaType: "tv",
      tmdbId: 2190,
      label: "South Park",
      season: 8,
      episode: 3,
    },
  },
  {
    target: { mediaType: "movie", tmdbId: 34584 }, // La storia infinita
    speaker: { name: "Suzie", personId: 1724092 },
    rating: 10,
    quote: "Turn around, look at what you see...",
    review:
      "Dustin mi ha chiamata alle brutte per farsi dare le cifre della costante di Planck. Prima però abbiamo cantato la sigla, tutta, dall'inizio. Turn around, look at what you see... C'era mezza Russia ad aspettare e ne è valsa comunque la pena.",
    source: {
      mediaType: "tv",
      tmdbId: 66732,
      label: "Stranger Things",
      season: 3,
      episode: 8,
    },
  },
];

# Trailer: copertura piena e nessuna corrispondenza sbagliata

Data: 2026-09-07 · Stato: approvato dall'utente, da implementare

## Il problema

Zapp mostra il trailer come fondale di ogni scheda titolo e di ogni pagina stagione.
È il cuore dell'esperienza: una scheda senza trailer è una scheda muta. Oggi il
sistema (`src/lib/trailers/`) sbaglia in due modi opposti, entrambi verificati sul
database di produzione.

### 1. Trailer di un altro film (grave)

Il ramo di ripiego "ricerca YouTube" (`rankSearchResults` in `rank.ts`) **non
confronta mai il nome del video con il titolo richiesto**. Filtra solo: canale in
allowlist, la parola "trailer" nel nome, lingua italiana. Il primo risultato che
passa vince, qualunque opera sia.

Righe reali di `title_trailers`, verificate con l'oEmbed di YouTube:

| Titolo in Zapp | Trailer effettivamente mostrato |
| --- | --- |
| Prison Break | **Scappa - Get Out** |
| Il giardiniere | **Scappa - Get Out** (lo stesso video) |
| Batman Begins | **Il Cavaliere Oscuro - Il Ritorno** |
| I Soprano | **I molti santi del New Jersey** |
| Breaking Bad | **El Camino** |
| Peaky Blinders | **The Immortal Man** |
| Madagascar | **Madagascar 3** |
| Chernobyl | documentario Sky "40 anni dalla catastrofe" |
| Superstore | **Super Market** (Prime Video) |

Nove errori su un campione di dieci righe `source = 'youtube'`; le righe con quella
provenienza sono 34. È un difetto sistemico del ramo, non un caso isolato.

### 2. Metà del catalogo senza trailer

Su 145 righe in `title_trailers`, 67 (46%) sono vuote. La causa non è l'assenza del
trailer, ma un'allowlist di 47 canali troppo stretta: vengono scartati trailer
**ufficiali italiani veri** (`official: true`, `iso_639_1: "it"` su TMDB) di *Silo*
e *Finch* (canale **Apple Italia**), *I pinguini di Madagascar* (**DreamWorks
Animation Italy**). Sono invece scartati correttamente i caricamenti di terzi
("Shameless - Trailer Italiano By MarcoString08", agenzia stampa "Pressview").

## Dati raccolti

Catalogo: 3277 righe in `titles` (520 senza alcun video su TMDB).

| Cosa offre TMDB | Titoli | Quota |
| --- | ---: | ---: |
| Trailer/Teaser **italiano e ufficiale** | 946 | 29% |
| Trailer/Teaser italiano (anche di terzi) | 1415 | 43% |
| Trailer/Teaser **ufficiale** in qualsiasi lingua | 2204 | 67% |
| Almeno un Trailer/Teaser | 2705 | 83% |
| Nessun video | 520 | 16% |

Censimento dei canali che ospitano quei video (YouTube Data API `videos.list` su
9932 chiavi, 9833 risolte): **1201 canali distinti**; i primi 60 coprono il 65% dei
video, i primi 150 l'80%. In testa ci sono canali di studio ufficiali oggi **fuori
allowlist**: Netflix (840 video), Warner Bros. (521), Sony Pictures Entertainment
(443), Lionsgate Movies (304), Marvel Entertainment (242), Universal Pictures,
Paramount Pictures, Disney, Pixar, 20th Century Studios, e le loro filiali
nazionali.

Vincolo di quota: `search.list` della YouTube Data API costa **100 unità** e la
quota gratuita è 10.000 unità al giorno → **100 ricerche al giorno**. La ricerca non
può girare su migliaia di titoli: resta l'ultima spiaggia.

## Decisioni dell'utente

1. Quando non esiste un trailer ufficiale italiano, Zapp mostra il trailer
   **ufficiale in inglese**, dichiarandolo con un'etichetta in pagina. Meglio un
   trailer inglese dichiarato che nessun trailer.
2. I video presi da TMDB si usano **solo se pubblicati da un canale ufficiale**
   (studio o distributore). Mai caricamenti di terzi.
3. La ricerca su YouTube resta come **ultima spiaggia**, e solo con una verifica
   dura che il video sia di quel titolo.

## Architettura

### La scala (si ferma al primo gradino che dà un risultato)

| # | Gradino | `lang` | Costo |
| --- | --- | --- | --- |
| 1 | Video TMDB, italiano, canale ufficiale | `it` | oEmbed + `videos.list` |
| 2 | Video TMDB, altra lingua, canale ufficiale | `en` | stessa chiamata |
| 3 | Ricerca YouTube "`<titolo>` trailer italiano", canale ufficiale, **verifica dura** | `it` | 100 unità di quota |
| 4 | Niente: resta il fondale | — | — |

Il gradino 2 precede il 3 perché la quota di ricerca è di sole 100 chiamate al
giorno: farla partire per ogni titolo privo di trailer italiano esaurirebbe la quota
in un'ora e lascerebbe il resto del catalogo senza nulla. Un titolo che ha già un
trailer inglese ufficiale non consuma quota.

`source` in `title_trailers` resta la provenienza (`tmdb` | `youtube` | `none`): il
vincolo `check` della migration 0013 non cambia, nessuna migration nuova. La lingua
sta dentro ogni trailer.

### `src/lib/trailers/match.ts` — la garanzia anti-scambio (nuovo, puro, Vitest)

Unico punto in cui si decide se un video **è** di un titolo.

```ts
export interface TitleIdentity {
  title: string;
  originalTitle?: string | null;
  /** Anno d'uscita, per scartare omonimi di altre epoche. */
  year?: number | null;
  /** > 0 sulla pagina di una stagione. */
  season?: number;
}

/** Il nome YouTube ridotto al nome dell'opera: vuoto se non ne contiene uno. */
export function workName(videoTitle: string): string;

/** Il video è di quel titolo? Usato dal gradino 3 (ricerca): deve essere certo. */
export function videoMatchesTitle(videoTitle: string, id: TitleIdentity): boolean;

/** Il video è palesemente di un'ALTRA opera? Usato dai gradini 1-2 (TMDB). */
export function videoContradictsTitle(videoTitle: string, id: TitleIdentity): boolean;
```

`workName` toglie dal nome YouTube tutto ciò che non è l'opera: coda del canale dopo
l'ultima `|` (`| Netflix Italia`, `| Sky`), etichette (`Trailer Ufficiale`,
`Official Trailer`, `Teaser`, `Primo trailer italiano`, `Trailer italiano
ufficiale`), qualificatori (`[HD]`, `4K`, `#2`, `ITA`, `SUB ITA`, `(2024)`), code
promozionali (`In Cinemas March 8`, `Dal 27 Novembre al cinema`, `In Theaters Nov
10`, `Only in cinemas`). Quel che resta è il nome dell'opera; se resta meno di due
parole o meno di sei caratteri il nome è considerato assente.

`videoMatchesTitle` accetta solo per **uguaglianza**, mai per contenimento:

- `titleSimilarity(workName, title) ≥ 0,90` oppure lo stesso contro
  `originalTitle`. `titleSimilarity` e `normalizeTitle` esistono già in
  `src/lib/import/netflix-title.ts`: vengono spostati in
  `src/lib/text/similarity.ts` e ri-esportati da `netflix-title.ts`, così import e
  trailer condividono una sola implementazione senza toccare i test dell'import.
- **Regola anti-sequel**: se il nome dell'opera e il titolo non hanno lo stesso
  numero finale (cifra, numero romano, ordinale: `2`, `II`, `Parte due`,
  `Capitolo 3`) il video è scartato. `titleSimilarity("Madagascar",
  "Madagascar 3")` è alto e senza questa regola passerebbe.
- **Regola anti-sottotitolo**: se il nome dell'opera ha un sottotitolo (dopo `:`,
  ` - `, ` – `) che il titolo non ha — o viceversa — il video è scartato. Blocca
  *Breaking Bad* → *El Camino: Il film di Breaking Bad*, *Peaky Blinders* →
  *Peaky Blinders: The Immortal Man*, *Batman Begins* → *Il Cavaliere Oscuro - Il
  Ritorno*.
- **Stagione**: con `season > 0` il nome del video deve nominare quella stagione
  (`stagione N`, `season N`, `parte N`); con `season = 0` un trailer di stagione va
  bene per la serie.
- **Anno**: se `year` è noto, la pubblicazione del video non può precedere l'uscita
  di più di due anni (regola già presente, mantenuta).

`videoContradictsTitle` è il **veto** applicato ai video presi da TMDB. TMDB associa
il video al titolo, quindi il rischio è minimo, ma la richiesta dell'utente è che un
trailer sbagliato non compaia mai: se `workName` estrae un nome d'opera sostanziale
e la sua somiglianza con `title` **e** con `originalTitle` è sotto 0,45, il video è
scartato. Un nome generico ("Trailer ufficiale", "Trailer Ufficiale Italiano") non
produce alcun nome d'opera e quindi non veta mai: la soglia bassa e la doppia
verifica evitano di perdere i titoli tradotti diversamente su YouTube.

### `channels.ts` — allowlist allargata sui dati

Resta un'allowlist esplicita: è ciò che tiene fuori i fan upload. Viene allargata
con i canali emersi dal censimento, in due famiglie come oggi:

- `italian: true` — distributori italiani: pubblicano solo materiale italiano.
  Aggiunti almeno **Apple Italia** (`@AppleItalia`), **DreamWorks Animation Italy**
  (`@DWAitaly`), più le filiali italiane degli studi presenti nel censimento.
- `italian: false` — canali globali di studio (Netflix, Warner Bros., Sony Pictures
  Entertainment, Universal Pictures, Paramount Pictures, Disney, Pixar, Marvel
  Entertainment, Lionsgate, 20th Century Studios, A24, Focus Features, Searchlight,
  Neon, e le filiali UK/CA/AU che pubblicano gli stessi trailer): la lingua non si
  presume, si legge.

Ogni canale aggiunto va verificato come da prassi già scritta in `CLAUDE.md`:
handle dall'`author_url` dell'oEmbed di un suo video, id dal campo `externalId`
nell'HTML di `youtube.com/@handle`, e `channels.list` (1 unità) per iscritti e
numero di video, così non entra uno squatter. Il censimento è versionato in
`docs/design/data/youtube-channel-census.txt` (numero di video nel catalogo, quota
cumulata, id del canale, nome, esempio di video): è la lista di partenza, ordinata
per peso reale nel catalogo.

Nessun canale entra "automaticamente": la lista resta scritta a mano nel file.

### Lingua del trailer

`Trailer` (in `frame-bars.ts`) guadagna un campo:

```ts
export interface Trailer {
  key: string;
  frame: TrailerFrame;
  lang: "it" | "en";
}
```

`lang` è `"it"` se TMDB dichiara `iso_639_1 === "it"`, se YouTube dichiara audio
italiano (`defaultAudioLanguage`), o se la lingua non è dichiarata da nessuno dei
due ma il canale è di un distributore italiano (`italian: true`) — la regola di
`isItalianForChannel`, che resta. Altrimenti `"en"`: è un'etichetta di ripiego, non
una certificazione della lingua esatta, e viene mostrata come "Trailer in inglese".
L'ordine dei candidati preferisce comunque `it` esplicito, poi `en` esplicito, poi
lingua assente, così un video davvero inglese arriva prima di uno di lingua ignota.

`parseTrailers` (in `stored.ts`) pretende `lang`: ogni riga salvata con la forma
vecchia viene considerata non valida e ricalcolata alla prima visita. Nessuna
migration: la colonna è `jsonb`.

### Interfaccia: l'etichetta

Quando il trailer mostrato ha `lang: "en"`, accanto ai comandi della testata compare
"Trailer in inglese". Concretamente: `HeaderControls`
(`src/components/title/HeaderControls.tsx`) prende una prop nuova `language?: "it" |
"en"` e, quando vale `"en"` **e** i comandi audio sono presenti (cioè il trailer è
davvero visibile), rende dentro la stessa pillola in vetro, a sinistra
dell'altoparlante, un testo `text-xs text-muted` "Trailer in inglese" con lo stesso
separatore verticale già usato fra audio e Condividi. Nessun elemento nuovo sopra il
video, nessuna modifica alla geometria della banda.

`CinematicBackdrop` possiede già lo stato del trailer corrente e monta
`HeaderControls` via portal: passa la lingua del trailer in riproduzione. Vale per
la scheda titolo e per la pagina stagione. L'anteprima al passaggio del mouse
(`PreviewCard`) non mostra l'etichetta: è una scheda di passaggio, senza comandi.

### Bonifica del cache

Le 34 righe `source = 'youtube'` sono avvelenate e le 67 `none` sono il frutto
dell'allowlist stretta: si svuota la tabella (`delete from title_trailers`). Non è
una perdita: ogni riga si ricalcola da sola alla prima visita, e il cambio di forma
di `trailers` la invaliderebbe comunque. `EMPTY_BEFORE_MS` in `official.ts` viene
portata alla data di questo intervento.

### Script

- `scripts/backfill-trailers.ts` — ricalcola in blocco, per non lasciare il primo
  visitatore ad aspettare. Ordine di priorità: titoli presenti in `watch_entries`,
  poi il resto per `fetched_at` decrescente. Rispetta la quota: si ferma dopo
  `--searches N` ricerche YouTube (default 80, sotto il tetto di 100) e stampa quanti
  titoli restano, così si può rilanciare il giorno dopo. Riprendibile: salta le
  righe già fresche.
- `scripts/audit-trailers.mjs` — controllo indipendente: per ogni riga di
  `title_trailers` legge l'oEmbed del video e stampa titolo Zapp, nome del video,
  canale e l'esito di `videoMatchesTitle`. Serve a dimostrare che il problema è
  chiuso e a riprenderlo in mano fra qualche mese. Va eseguito dopo il backfill.

## Verifica

- **Vitest** su `match.ts`, con fixture ricavate dai casi reali di oggi:
  - scarti: `Prison Break` ⇸ "SCAPPA - GET OUT - Trailer italiano ufficiale";
    `Batman Begins` ⇸ "Il Cavaliere Oscuro - Il Ritorno | Primo trailer italiano
    ufficiale"; `Breaking Bad` ⇸ "El Camino: Il film di Breaking Bad | Trailer
    ufficiale | Netflix Italia"; `Peaky Blinders` ⇸ "Peaky Blinders: The Immortal
    Man | Trailer ufficiale | Netflix Italia"; `Madagascar` ⇸ "Madagascar 3:
    Ricercati in Europa - Trailer italiano ufficiale"; `I Soprano` ⇸ "I MOLTI SANTI
    DEL NEW JERSEY – Trailer Ufficiale Italiano"; `Superstore` ⇸ "Super Market |
    Trailer Ufficiale | Prime Video".
  - accettazioni: `Il padrino` ✓ "Il Padrino 50° anniversario | Trailer | Eagle
    Pictures"; `Silo` ✓ "SILO — Trailer ufficiale | Apple TV+"; `One Piece` ✓ "ONE
    PIECE | Trailer ufficiale | Netflix"; `House of the Dragon` stagione 3 ✓ "House
    Of The Dragon | Stagione 3 | Teaser Trailer Ufficiale | Sky Italia" con
    `season: 3`, e lo stesso video scartato con `season: 1`.
  - `videoContradictsTitle`: falso su "Trailer ufficiale" (nome generico), vero su
    un nome d'opera estraneo.
- **Vitest** su `stored.ts`: una riga senza `lang` va ricalcolata.
- `pnpm typecheck && pnpm lint && pnpm test`, poi `pnpm build` in una cartella
  isolata (`NEXT_DIST_DIR=.next-check`) come da `CLAUDE.md`.
- `scripts/audit-trailers.mjs` dopo il backfill: zero righe segnalate.
- Controllo a occhio sulla scheda titolo di un titolo con trailer inglese, per
  l'etichetta.

## Fuori perimetro

- Nessuna nuova fonte di trailer oltre a TMDB e YouTube (niente scraping di Netflix
  o Prime Video: la regola del progetto resta).
- Nessun "promuovi a italiano più tardi": un titolo che si è fermato al trailer
  inglese ci resta finché la riga non scade (30 giorni). Un lavoro periodico che
  spende le 100 ricerche quotidiane per sostituire gli inglesi con gli italiani è
  un possibile passo successivo, non parte di questo intervento.
- Il riquadro delle bande nere, la banda della testata e la logica del player non
  cambiano.

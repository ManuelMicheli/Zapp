# Corti (`/corti`)

424 cortometraggi che si guardano **dentro** Zapp, con trama in italiano e
copertina di YouTube. E' l'unica sezione dove Zapp riproduce un video intero invece
di mandare l'utente altrove: qui si puo' fare, perche' sono opere pubblicate su
YouTube dai loro autori (o da chi le distribuisce su licenza) con l'incorporamento
acceso dal titolare. Restano fuori i ricaricamenti di corti Pixar o Disney su canali
terzi, anche quando hanno cento milioni di visualizzazioni.

## Dove sta cosa

| Pezzo                                  | File                                        |
| -------------------------------------- | ------------------------------------------- |
| Il catalogo (i dati)                   | `src/data/short-films.json`                 |
| Tipi, filtri, etichette (**senza i dati**) | `src/lib/shorts/shape.ts`                |
| Il catalogo caricato, simili           | `src/lib/shorts/catalog.ts` (+ `.test.ts`)  |
| Lo stato dell'utente (letture)         | `src/lib/shorts/queries.ts`                 |
| Visto / preferito (scritture)          | `src/lib/shorts/actions.ts`                 |
| Griglia e filtri                       | `src/components/shorts/ShortsBrowser.tsx`   |
| Card, card di copertina                | `ShortCard.tsx`, `ShortFeatured.tsx`        |
| Player a facciata                      | `ShortPlayer.tsx`                           |
| Scaffale in home e in Scopri           | `ShortsShelf.tsx`                           |
| Rotte                                  | `src/app/(app)/corti/{page,[slug]/page}.tsx`|
| Tabella dell'utente                    | migration `0064_short_films.sql`            |

## Il catalogo e' un file, non una tabella

`src/data/short-films.json` cambia con un rilascio, non con l'uso: metterlo in
Postgres avrebbe aggiunto una tabella pubblica, le sue policy e un giro di rete per
disegnare una griglia che e' sempre la stessa per tutti. Stessa scelta di
`src/data/genre-picks.json`.

Nel database sta **solo** cio' che il file non puo' sapere: `short_film_entries`
(`user_id`, `short_id`, `watched_at`, `favorite`). La chiave e' l'id del video
YouTube e non lo slug, perche' lo slug e' il titolo ripulito e puo' cambiare quando
si corregge un titolo. Un vincolo impedisce le righe che non dicono niente: quando si
spengono sia "visto" sia "preferito" la riga si cancella.

Le policy lasciano passare solo le proprie righe — a differenza di `watch_entries` e
`favorite_people` i corti non compaiono nel feed degli amici, quindi nessuno ha
motivo di leggerli. Il giorno in cui servissero, si aggiunge
`or user_id in (select public.my_friend_ids())` come nelle altre tabelle.

## Come sono stati scelti

Da una raccolta di 524 link YouTube, passata per `videos.list` dell'API YouTube
(`part=snippet,statistics,contentDetails,status`, 11 unita' di quota in tutto).
Ne sono rimasti **424**, di cui 51 italiani, 52 senza dialoghi e 35 premiati o
candidati. I filtri, in ordine:

1. **Vivi e riproducibili qui**: `status.embeddable` vero e `privacyStatus` pubblico.
   Un corto che YouTube non lascia incorporare sarebbe una card che non si apre.
2. **Durata da cortometraggio**: fra 2 e 45 minuti.
3. **Legittimi**: caricati dall'autore o da un canale che distribuisce su licenza
   (Omeleto, ALTER, DUST, Short of the Week, CGMeetup, NITV, Filmakademie, GOBELINS,
   Blender Studio, i canali ufficiali di Disney, Sony Pictures Animation, Nintendo,
   Ubisoft). Scartati a mano: i ricaricamenti di corti Pixar su canali privati, i
   doppiaggi italiani non autorizzati, i doppioni dello stesso corto su due canali.
4. **Con una trama vera.** Molti canali pubblicano solo crediti, link e inviti
   all'iscrizione. Quei corti restano fuori (una trentina), e restano fuori anche le
   clip di premiazione caricate al posto del film e i montaggi di commento: una trama
   inventata e' peggio di un corto in meno.

L'ordine e' la fama, ma in **due blocchi**: prima gli inglesi, poi gli italiani. In
una classifica unica il primo corto italiano finirebbe oltre la centesima posizione,
e Zapp e' un'app italiana. Fra gli italiani ci sono Ettore Scola, Gabriele Salvatores,
Stefano Accorsi e il Globo d'Oro "Due Piedi Sinistri".

Le **trame sono scritte a mano in italiano**: le descrizioni dei canali YouTube sono
per meta' crediti, link e inviti all'iscrizione. Dove il canale non aveva una sinossi
usabile il corto non e' entrato: e' il filtro 4 qui sopra, ed e' un meccanismo
(`build-full.mjs` tiene solo gli id per cui esiste una trama scritta), non una svista.

Il campo `senzaDialoghi` e' una terza categoria accanto a `it` e `en`, non un
attributo: un corto muto non e' "in inglese" perche' il cartello finale e' in inglese,
e `filtraShorts` lo tiene fuori da entrambe le lingue (c'e' un test che lo fissa).

## Aggiornare il catalogo

```bash
pnpm tsx --env-file=.env.local scripts/refresh-short-films.ts          # prova a vuoto
pnpm tsx --env-file=.env.local scripts/refresh-short-films.ts --scrivi # salva
```

Il collaudo nel browser sta in `scripts/corti-check.mjs` (utente finto che si crea e
si cancella da solo): che la griglia disegni tutte le card, che le
copertine YouTube arrivino davvero — la CSP e' il punto dove si rompono — che la barra
dei filtri **copra** le card che le scorrono sotto invece di lasciarle in trasparenza,
che il player non esista prima del tocco, e che "visto"/"preferito" scrivano e
spengano la riga.

```bash
BASE=http://localhost:3405 node --env-file=.env.local scripts/corti-check.mjs
```

Lo script di aggiornamento **non sceglie** i corti: rinfresca solo cio' che invecchia da solo (durata,
anno, canale, visualizzazioni, esistenza della copertina HD) e soprattutto elenca i
corti **spariti** o diventati non incorporabili. Quelli vanno sostituiti a mano, con
lo stesso metro degli altri. Nove unita' di quota YouTube per un giro intero.

## Il player e' una facciata

Finche' non si preme play in pagina non esiste nessun iframe: c'e' la copertina e un
bottone. Un `<iframe>` di YouTube montato subito scarica qualche centinaio di kB e
contatta Google prima che l'utente abbia chiesto di vedere qualcosa. Al primo tocco
parte `www.youtube-nocookie.com`, che e' gia' l'unico host in `frame-src` nella CSP
(serviva per le anteprime della home, vedi `home.md`).

**"Visto" si accende da solo** dopo un minuto di riproduzione — meta' durata per i
corti piu' brevi — e solo per chi ha un account. Non c'e' modo di sapere se il video
sta davvero andando: gli eventi di riproduzione arriverebbero dall'IFrame API, che e'
uno script servito da `www.youtube.com`, e la CSP non lo ammette. Quindi e' un timer
dal momento del play: chi apre e chiude subito non risulta averlo visto, chi lascia la
pagina aperta senza guardare si'. Il bottone "Visto" lo spegne con un tocco.

## Le copertine vengono da `i.ytimg.com`

YouTube pubblica due sole taglie utili, `maxresdefault` (1280px) e `hqdefault`
(480px), e la prima **esiste solo** se il caricamento originale era almeno 1280px: per
28 corti su 424 non c'e'. Il file dice quali (`copertinaHd`), cosi' l'assenza
non si scopre con un 404 davanti all'utente.

L'host e' stato aggiunto a `next.config.ts` in `img-src` **e** in `connect-src`: la
seconda perche' la CSP vale anche per `sw.js`, e il service worker fa `fetch` delle
immagini (cache-first, la stessa cache dei poster TMDB — una miniatura YouTube non
cambia mai per un dato video). Le immagini sono `unoptimized`: `i.ytimg.com` non e'
un CDN a larghezze, chiedere `w=384` non serve a niente.

## I filtri stanno nel client

Lingua, genere e "Da vedere" sono stato di React, non query dell'indirizzo. Due
motivi: sullo stesso pathname con la sola query diversa l'App Router non naviga (la
trappola descritta in `genres.md`), e le card sono gia' tutte in pagina — filtrarle in
memoria e' istantaneo. Il prezzo e' che un filtro non e' condivisibile con un link; il
link che conta e' quello del singolo corto, e c'e'.

La card ha `content-visibility: auto` con la misura intrinseca reale (16:9 piu' due
righe): senza, il browser paga layout e paint anche per le centinaia fuori schermo.

## Il peso: due moduli, non uno

Il catalogo pesa 160 kB di JSON, e la griglia filtra nel client: senza precauzioni
quel file finisce **due volte** nel browser — nel bundle e nel payload della pagina.
Due mosse lo evitano, e valgono insieme:

- **`shape.ts` non importa il JSON.** Tipi, `copertinaUrl`, `durataLabel`,
  `filtraShorts` stanno li'; `catalog.ts` importa i dati e riesporta le forme. I
  componenti client (`ShortPlayer`, `ShortActions`, le card) importano da `shape.ts`:
  se importassero da `catalog.ts`, il bundle della **scheda di un corto solo** si
  porterebbe dietro tutte le trame del catalogo.
- **Al client vanno le card snelle** (`ShortCardData`, via `SHORT_CARDS`): niente
  trama, canale, id canale, visualizzazioni. `cardDi` elenca i campi uno per uno
  invece di scartarli con un rest, cosi' un campo nuovo su `ShortFilm` non scivola nel
  browser in silenzio. La trama serve a una card sola, quella di apertura, e quella
  arriva intera dal server.

Misura dopo il taglio: `/corti` 117 kB di first load con 424 corti, contro i 132 kB
che costava con cento prima della separazione.

## Dove si entra

- **Home**: scaffale "Corti" accanto alle saghe, sotto il cancello "Film"
  (`HomeTypeGate type={["all","movie"]}`) — un cortometraggio e' un film, e chi ha
  messo la home su "Serie TV" non vuole vederlo. Sta in entrambi i rami della home
  (profilo ricco e no) perche' e' catalogo curato, non dipende da cosa hai visto.
- **Scopri**: lo stesso scaffale, sotto le saghe.
- **Diretto**: `/corti`, e `/corti/<slug>` per il singolo corto (condivisibile, con
  Open Graph e la copertina).

La nav resta a cinque voci con la Z al centro: "Corti" non e' una voce di barra
(vedi `src/components/layout/tabs.tsx` per il perche' l'ordine e' la barra).

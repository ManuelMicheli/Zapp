# Cinema: biglietti — deep link per spettacolo, QR in app, foglio e card a forma di biglietto

Data: 2026-09-06. Stato: approvato in chat (deep link livello 1 + livello 2 per Notorious e UCI;
upload screenshot/PDF con lettura QR; foglio biglietto alto ~90% a forma di ticket; card in home
a forma di ticket con QR).

## Obiettivo

1. "Compra i biglietti" porta il più vicino possibile al checkout del **film e orario scelti**
   sul sito della catena, senza scraping HTML né sessioni ricostruite.
2. Dopo l'acquisto l'utente carica screenshot o PDF del biglietto: l'app legge i QR e li mostra
   grandi e nitidi nella card in home, pronti da presentare in sala.
3. Il foglio che si apre toccando un orario e il promemoria in home hanno la forma di un
   biglietto: immagine del film in primo piano, orario grande, tagliando con cinema e QR.

Fuori scope: acquisto dentro l'app, recupero automatico dei biglietti dalle catene (nessuna API),
posti in sala live, Apple/Google Wallet.

## 1. Deep link biglietteria

### Cosa espongono le catene (verificato 2026-09-06, JSON pubblici senza autenticazione)

| Catena | Livello 1 (pagina film/cinema) | Livello 2 (spettacolo esatto) |
|---|---|---|
| UCI | `https://ucicinemas.it/cinema/{slug}` — **senza `www`**: con `www` ogni path va in coda Queue-it | `https://ucicinemas.it{cart_link}` con `cart_link` = `/movies/{film}/acquista/{localId}/{eventId}/{performanceId}` dal JSON programmazione; risponde 302 a `login.ucicinemas.it` e prosegue nel carrello dopo il login (che serve comunque per comprare) |
| The Space | `https://www.thespacecinema.it/cinema/{cinemaName}/film/{filmSlug}` (orari e scelta data in pagina) | no: la sessione sta dietro un endpoint 401 |
| Notorious | `https://www.notoriouscinemas.it/generic/scheda.php?id={idFilm}&idcine={idWebtic}` | `https://www.notoriouscinemas.it/generic/seatsframe.php?sc={idWebtic}&sp={PerformanceId}#seatsframe` = scelta posti, 200 senza login |
| Cinelandia | `https://www.cinelandia.it/{film-slug}/` (orari di tutte le sedi) | non in questa iterazione |

Endpoint JSON usati (GET, nessuna chiave):

- UCI, base `https://myuci---uci-backend-production-nfluwp7wga-oc.a.run.app/api` (letta da
  `__NUXT__.config.public.apiUrl`, va in `UCI_API_BASE` in `config.ts` così si cambia senza
  toccare il codice): `/theatres` (id, name, slug, latitude, longitude, city), `/movies`
  (id, title, slug), `/theatres/{slug}/programming/{YYYY-MM-DD}?movieSlug={slug}` →
  `screens[].{formato}[].performances[] {id, starts_at, cart_link, …}`.
- The Space: `https://www.thespacecinema.it/api/microservice/showings/cinemas` →
  `result[].cinemas[] {cinemaId, cinemaName, fullName, whatsOnUrl}`; `…/showings/films` →
  `result[] {filmId, filmUrl, …}`.
- Notorious: `https://www.notoriouscinemas.it/cvu/modules/prenoRapido.php?sel=getCinema` →
  `[{IDWEBTIC, DESCR}]`; `…?sel=getFullSched&idcine={id}` → formato Webtic
  `DS.Scheduling.Events[] {EventId, Title, OriginalTitle, TitleId, Days[] {Day, Performances[]
  {PerformanceId, Time, StartTime}}}`.
- Cinelandia: `https://www.cinelandia.it/wp-json/wp/v2/pages?slug={slug}` per confermare che la
  pagina film esiste.

### Modulo `src/lib/cinema/booking/`

Tutto `server-only`, mai dal client. Un file per catena + funzioni pure testate.

- `types.ts`: `BookingQuery = { cinema: {id, name, lat, lng}, film: {title, originalTitle}, date: "YYYY-MM-DD", times: string[] /* "HH:MM" */ }`;
  `BookingLink = { url: string; level: 2 | 1 }`; risultato per cinema:
  `{ byTime: Map<string, BookingLink>; fallback: BookingLink | null }` (livello 1 quando il film
  è riconosciuto ma l'orario no).
- `fetch.ts`: `fetchJson<T>(url, ttlSeconds)`: `unstable_cache` per URL, timeout 6 s,
  User-Agent `Zapp/1.0 (+NEXT_PUBLIC_APP_URL)`, throttle 4 richieste/s (stesso schema di
  `mymovies/client.ts`), qualunque errore → `null`. Log `[booking]` con URL e durata.
  TTL: elenchi cinema 24 h, elenchi film 6 h, programmazione/scheduling 30 min.
- `match.ts` (puro, Vitest): `nearestVenue(list, geo, maxKm = 0.5)` per gli elenchi con
  coordinate (UCI); `bestByName(list, name)` su `normalizeTitle` + Dice (riusa
  `titleSimilarity` di `src/lib/import/netflix-title.ts`) con soglia 0,85 per cinema e film;
  `sameTime(isoOrHHMM, "HH:MM")` che confronta solo ore e minuti nel giorno richiesto (UCI
  `starts_at` ISO con offset, Notorious `Time` "HH:MM" + `Day`).
- `uci.ts`, `thespace.ts`, `notorious.ts`, `cinelandia.ts`: `resolve(q: BookingQuery)`; ognuno
  decide se il cinema è suo con `chainFor(name)` (`chains.ts`) e ritorna `null` quando un
  passo fallisce, così la cascata scende. Livello 2 solo UCI e Notorious.
- `index.ts`: `resolveShowingLinks(q)` → prova la catena riconosciuta, altrimenti `null`.

Parametri in `config.ts`: `UCI_API_BASE`, `BOOKING_TTL_*`, `BOOKING_VENUE_MAX_KM = 0.5`.

### Cascata finale (per spettacolo)

In `links.ts`, nuova `resolveShowingBookingLinks(cinemas, film, date, timesByCinema)`:

1. `cinema_links` `manual` (per cinema, tutti gli orari);
2. livello 2 della catena (per orario);
3. livello 1 della catena (per cinema+film);
4. sito del cinema (`cinema_links` `movieglu`, oggi sempre `null` con MyMovies);
5. home della catena;
6. Google "cinema film biglietti".

`Showing` prende `bookingLevel: 2 | 1 | 0` (0 = passi 4–6). `mymovies/showtimes.ts`
`filmShowtimes` e `cinemaProgramme` passano per la nuova funzione; i link di catena si
calcolano solo per i cinema che `chainFor` riconosce (al massimo 5 per pagina, poche chiamate
grazie alla cache). `cinema_plans.booking_url` continua a salvare l'URL dello spettacolo scelto.

UI: la CTA dice **"Scegli i posti"** a livello 2, "Compra i biglietti" altrimenti; sempre
`target="_blank" rel="noopener"`, mai iframe.

## 2. Biglietti in app (QR)

### Dati (migration `0016_cinema_tickets.sql`, da applicare via MCP)

```sql
alter table public.cinema_plans
  add column ticket_codes text[] not null default '{}',
  add column ticket_path text,
  add column ticket_added_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', false, 10485760,
        array['image/jpeg','image/png','image/webp','application/pdf']);
-- policy select/insert/update/delete: bucket_id = 'tickets'
--   and (storage.foldername(name))[1] = auth.uid()::text
```

Percorso oggetto: `{user_id}/{plan_id}/{timestamp}.{ext}`. Cancellando il piano si cancella
anche l'oggetto (Server Action). Il bucket è privato: la card riceve un **URL firmato (1 h)**
creato lato server con il client RLS in `getUpcomingPlan` (`queries.ts`, campo `ticketUrl`),
usato solo quando serve mostrare l'originale (nessun QR letto, o "Vedi originale").

### Lettura QR (client, `src/lib/qr/decode.ts`)

`decodeTicket(file): Promise<{ codes: string[] }>`:

- immagini: `createImageBitmap` → canvas (lato lungo ≤ 1600 px) → `jsqr`
  (`inversionAttempts: "attemptBoth"`); se nessun risultato riprova a 0,5× e 2×. Dopo ogni QR
  trovato si copre la sua area in bianco e si ricomincia (max 4 per pagina): due biglietti
  nella stessa immagine danno due codici.
- PDF: `pdfjs-dist` importato dinamicamente solo quando il file è PDF, worker same-origin via
  `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` (CSP `script-src 'self'`
  invariata); pagine 1–3 rese a scala 2 su canvas → stesso ciclo delle immagini.
- codici deduplicati, ognuno tagliato a 2 KB, al massimo 10.

Librerie: `jsqr` 1.4, `qrcode` 1.5 (rendering), `pdfjs-dist` 6.x. Sono utilità, non UI
library.

### Server Actions (`src/lib/cinema/tickets.ts`, `"use server"`)

- `attachTicket(planId, { codes, path })`: piano dell'utente (`getUser()`), `codes` array di
  stringhe (≤ 10, ≤ 2 KB ciascuna), `path` che inizia con `${uid}/${planId}/` oppure `null`;
  scrive le tre colonne; `revalidatePath("/")`.
- `removeTicket(planId)`: azzera le colonne e rimuove l'oggetto dal bucket.
- `cancelPlan` rimuove anche l'eventuale oggetto.

### Componenti

- `TicketImport` (client): bottone "Aggiungi il biglietto" → `<input type="file"
  accept="image/*,application/pdf">`; stato "Leggo il QR…"; carica l'originale nel bucket con
  il client browser (`createClient()` di `supabase/client.ts`, come `AvatarPicker`), decodifica,
  chiama `attachTicket`. Esiti: N QR → toast "Biglietto aggiunto"; 0 QR → salva il file e avvisa
  "QR non riconosciuto: mostro l'immagine"; errore upload → toast, nulla scritto.
- `TicketQr` (client): QR ridisegnato con `qrcode` (`toDataURL`, fondo bianco, margine 2,
  correzione M); tap → `QrFullscreen`: overlay bianco a tutto schermo, QR al massimo della
  larghezza, testo del codice sotto in piccolo, più QR scorrevoli in orizzontale, chiudi con
  tap/Escape.

## 3. Foglio biglietto (`TicketSheet`)

- `Sheet` prende `size?: "auto" | "tall"`: `tall` = altezza `min(90svh, 900px)`, contenuto
  scrollabile, stessa maniglia e swipe, stesso `max-w-[480px]` a tutte le larghezze.
- `TicketShape` (`src/components/cinema/TicketShape.tsx`, client, riusabile): card
  `rounded-[24px] border border-border bg-surface overflow-hidden`; in cima il backdrop 16:9
  (TMDB `original`, `object-cover`, velo verso il basso) con titolo sopra; corpo con l'**orario
  grande** (es. "21:15", 40px), data estesa, badge formato, cinema + indirizzo + distanza,
  countdown; **perforazione**: riga con due tacche semicircolari (cerchi `bg-bg` a -12px sui
  lati) e tratteggio `border-dashed border-white/15`; sotto, il **tagliando** (`children`).
  Nessuna libreria: solo Tailwind e SVG inline.
- `TicketSheet` usa `Sheet size="tall"` + `TicketShape`. Tagliando: CTA primaria "Scegli i
  posti"/"Compra i biglietti" (link esterno), poi "Ci vado" e "Invita amici" (secondarie).
  Dopo "Ci vado" il foglio **resta aperto**: il tagliando mostra "Serata salvata ✓" con
  `TicketImport` ("Aggiungi il biglietto quando l'hai comprato") e il toast con "Annulla" resta.
  Se il piano esiste già per quello spettacolo (`planShowing` fa upsert), stesso stato.

## 4. Card in home (`PlanCard`)

Stesso `TicketShape`: backdrop in primo piano, etichetta "Stasera al cinema", titolo, orario
grande + countdown; tagliando con nome cinema e, se `ticket_codes` non è vuoto, i `TicketQr`
(riga scorrevole se più di uno) con "Vedi originale" quando c'è `ticket_path`; se c'è solo
`ticket_path` l'immagine originale (URL firmato); altrimenti `TicketImport`. Bottoni
"Biglietti" (o "Scegli i posti") e "Indicazioni" restano; lo stato "Com'è andata?" resta come
oggi. Un solo piano (il prossimo), come ora.

## Sicurezza e vincoli

- Nessuna chiamata alle catene dal client; CSP invariata (Supabase già in `connect-src` e
  `img-src`, worker pdf.js same-origin, canvas/blob locali).
- Bucket privato con policy per cartella `auth.uid()`; la Server Action controlla proprietà del
  piano e prefisso del path; i codici sono testo opaco, mai interpretati.
- `cinema_plans.booking_url` accetta solo `https?://` (già in `sanitize`).
- Le API delle catene sono non documentate: ogni errore o forma diversa → `null` → livello
  inferiore; mai un errore in pagina. Tetto 5 cinema per pagina, cache 30 min.

## Verifica

- Vitest: `booking/match.test.ts` (venue per distanza, nome, orario) e un test per catena su
  fixture JSON ridotte in `booking/__fixtures__/` (costruzione URL livello 1 e 2, `null` sui
  mancati match); `qr` niente test (canvas).
- `pnpm typecheck && pnpm lint && pnpm build`.
- Playwright (`next start`): apre un orario → foglio tall con forma ticket (screenshot mobile
  e desktop); "Ci vado" → tagliando con "Aggiungi il biglietto"; carica un PNG con QR generato
  da `qrcode` via `setInputFiles` → home mostra il QR e il codice; overlay a tutto schermo;
  pulizia del piano alla fine. Deep link: log `[booking]` con un cinema UCI e uno Notorious
  reali (posizione Milano) e controllo che l'URL abbia `acquista/…` o `seatsframe.php`.

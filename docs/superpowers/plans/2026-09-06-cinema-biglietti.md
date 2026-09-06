# Cinema biglietti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "Compra i biglietti" apre lo spettacolo esatto sul sito della catena (UCI, Notorious a livello 2; The Space, Cinelandia a livello 1), l'utente carica il biglietto e vede i QR in home, foglio e card a forma di ticket.

**Architecture:** Modulo server-only `src/lib/cinema/booking/` (un resolver per catena su JSON pubblici, funzioni pure di match testate) innestato nella cascata di `links.ts`, per singolo `Showing`. Biglietti: tre colonne su `cinema_plans` + bucket privato `tickets`; decodifica QR nel browser (`jsqr`, `pdfjs-dist`), rendering con `qrcode`. UI: `TicketShape` riusato da `TicketSheet` (Sheet `tall`) e `PlanCard`.

**Tech Stack:** Next.js 15, TypeScript strict, Supabase (Postgres + Storage), Vitest, `jsqr` 1.4, `qrcode` 1.5, `pdfjs-dist` 6.

**Spec:** `docs/superpowers/specs/2026-09-06-cinema-biglietti-design.md`

## Global Constraints

- Nessuna chiamata alle catene o a Supabase Storage con service role dal client; resolver `server-only`.
- CSP invariata (`next.config.ts`); worker pdf.js same-origin.
- Nessuna UI library; icone SVG inline `strokeWidth 1.8`; token Tailwind (`bg-surface`, `text-muted`, `accent-pale`…), mai hex.
- Copy italiano; commenti in italiano; Prettier printWidth 90, doppi apici.
- Test Vitest solo su funzioni pure; il resto `pnpm typecheck && pnpm lint && pnpm build`.
- Migration applicata via MCP Supabase (progetto `bbuhwzdbzxgydewmcdwd`), mai `supabase db push`; poi `src/types/database.ts` aggiornato a mano nello stesso stile.
- UCI: host `https://ucicinemas.it` senza `www`.
- Commit piccoli, solo i file propri (tree condiviso con altre sessioni).

---

## File map

Create:
- `src/lib/cinema/booking/types.ts` — `BookingQuery`, `BookingLink`, `ChainLinks`.
- `src/lib/cinema/booking/fetch.ts` — `fetchJson<T>(url, ttlS)`.
- `src/lib/cinema/booking/match.ts` (+ `match.test.ts`) — `nearestVenue`, `bestByName`, `sameTime`, `dateOf`.
- `src/lib/cinema/booking/uci.ts`, `thespace.ts`, `notorious.ts`, `cinelandia.ts` — `resolve(q)`; parti pure `build*` esportate e testate con fixture in `__fixtures__/`.
- `src/lib/cinema/booking/index.ts` — `resolveChainLinks(q)`.
- `supabase/migrations/0016_cinema_tickets.sql`.
- `src/lib/cinema/tickets.ts` — Server Actions `attachTicket`, `removeTicket`.
- `src/lib/qr/decode.ts` — `decodeTicket(file)`.
- `src/components/cinema/TicketShape.tsx`, `TicketImport.tsx`, `TicketQr.tsx`, `QrFullscreen.tsx`.

Modify:
- `src/lib/config.ts` — `UCI_API_BASE`, `BOOKING_*`.
- `src/lib/cinema/types.ts` — `Showing.bookingLevel`.
- `src/lib/cinema/links.ts` — `resolveShowingBookingLinks`.
- `src/lib/cinema/mymovies/showtimes.ts` — usa la nuova cascata.
- `src/lib/cinema/plans.ts` — `cancelPlan` rimuove l'oggetto; `PlanInput.bookingLevel`.
- `src/lib/cinema/queries.ts` — `getUpcomingPlan` → `{ plan, ticketUrl }`.
- `src/components/ui/Sheet.tsx` — `size`.
- `src/components/cinema/TicketSheet.tsx`, `PlanCard.tsx`, `TonightAtCinema.tsx`, `ShowtimeChip.tsx` (nessuna modifica se non serve).
- `src/types/database.ts`, `CLAUDE.md`, `package.json`.

---

### Task 1: match puro + fixture + tipi

**Files:** create `booking/types.ts`, `booking/match.ts`, `booking/match.test.ts`; modify `src/lib/config.ts`.

**Produces:**
```ts
export interface BookingQuery { cinema: { id: number; name: string; lat: number; lng: number }; film: { title: string; originalTitle: string | null }; date: string /* YYYY-MM-DD */; times: string[] /* HH:MM */ }
export interface BookingLink { url: string; level: 2 | 1 }
export interface ChainLinks { byTime: Map<string, BookingLink>; fallback: BookingLink | null }
export function nearestVenue<T extends { lat: number; lng: number }>(list: T[], geo: LatLng, maxKm?: number): T | null
export function bestByName<T>(list: T[], name: (t: T) => string, wanted: string, threshold?: number): T | null
export function hhmm(iso: string): string        // "2026-09-06T21:15:00+02:00" → "21:15", anche "21:15:00" → "21:15"
export function dateOf(iso: string): string      // "2026-09-06T…" → "2026-09-06"
```
`bestByName` usa `titleSimilarity` (`@/lib/import/netflix-title`) e ritorna il migliore ≥ threshold (default 0.85); pareggi → primo. `nearestVenue` usa `distanceKm` di `geo.ts`, default `BOOKING_VENUE_MAX_KM` 0.5.

- [ ] Test: nearestVenue (dentro/fuori raggio, lista vuota), bestByName ("Coyote vs. Acme" ↔ "COYOTE VS ACME", sotto soglia → null), hhmm/dateOf.
- [ ] Impl minima, test verdi, commit `feat(booking): match puro per catene`.

### Task 2: fetchJson + UCI

**Files:** create `booking/fetch.ts`, `booking/uci.ts`, `booking/uci.test.ts`, `booking/__fixtures__/uci-*.json` (ridotte: 2 teatri, 2 film, 1 programmazione con 2 performance).

`fetch.ts`: `fetchJson<T>(url: string, ttlS: number): Promise<T | null>` = `unstable_cache(async () => raw(url), [url], { revalidate: ttlS })`; `raw` con throttle 4/s (copia dello schema mymovies), timeout 6 s, UA, `cache: "no-store"`, log `[booking] ok/err url ms`. Fuori dal cache-wrapper mai eccezioni.

`uci.ts`:
```ts
export interface UciTheatre { id: number; name: string; slug: string; latitude: number; longitude: number }
export interface UciMovie { id: number; title: string; slug: string }
export interface UciPerformance { id: number; starts_at: string; cart_link: string }
export interface UciProgramming { screens: Record<string, Record<string, { performances: UciPerformance[] }[]> | { performances: UciPerformance[] }[]> }
export function buildUciLinks(theatre: UciTheatre, movie: UciMovie | null, performances: UciPerformance[], q: BookingQuery): ChainLinks  // puro
export async function resolveUci(q: BookingQuery): Promise<ChainLinks | null>
```
Nota: la forma esatta di `screens` va letta dal JSON reale in fase di fixture (`curl` di `/theatres/uci-cinemas-bicocca-milano/programming/<oggi>`); `flattenPerformances(programming)` raccoglie ricorsivamente ogni array `performances`. Livello 2: per ogni `q.times` la performance con `hhmm(starts_at) === time` e `dateOf(starts_at) === q.date` → `https://ucicinemas.it${cart_link}`. Fallback livello 1: `https://ucicinemas.it/cinema/${theatre.slug}`.

- [ ] Test `buildUciLinks` su fixture: due orari → due URL `acquista/…`; orario assente → solo fallback; film null → solo fallback.
- [ ] Impl; commit `feat(booking): resolver UCI`.

### Task 3: Notorious, The Space, Cinelandia, index

**Files:** `booking/notorious.ts` (+test, fixture `notorious-getcinema.json`, `notorious-fullsched.json`), `thespace.ts` (+test, fixture `thespace-cinemas.json`, `thespace-films.json`), `cinelandia.ts` (+test), `booking/index.ts`.

Notorious: `getCinema` → `bestByName(list, r => r.DESCR, q.cinema.name)`; `getFullSched&idcine=` → `Events` con `bestByName(ev => ev.Title)`, poi `Days.find(d => dateOf(d.Day) === q.date).Performances` con `Time === time` → `https://www.notoriouscinemas.it/generic/seatsframe.php?sc=${idcine}&sp=${PerformanceId}#seatsframe` (livello 2); fallback `https://www.notoriouscinemas.it/generic/scheda.php?id=${TitleId}&idcine=${idcine}` se `TitleId` numerico, altrimenti null.

The Space: `showings/cinemas` → `result.flatMap(g => g.cinemas)`; `bestByName(c => c.fullName ?? c.cinemaName)`; `showings/films` → `bestByName(f => titolo da filmUrl: ultimo segmento con "-" → " ")` sul titolo (soglia 0.85); livello 1 `https://www.thespacecinema.it/cinema/${cinemaName}/film/${slug}`; senza film → `whatsOnUrl` assoluto (`new URL(whatsOnUrl, base)`).

Cinelandia: `slug = slugify(title)` (riusa `slugify` di `mymovies/parse.ts`); `wp-json/wp/v2/pages?slug=` → array non vuoto → livello 1 `https://www.cinelandia.it/${slug}/`; altrimenti null.

`index.ts`:
```ts
export async function resolveChainLinks(q: BookingQuery): Promise<ChainLinks | null>
```
sceglie con `chainFor(q.cinema.name)?.name`; `try/catch` → null.

- [ ] Test per catena su fixture (URL livello 2/1, null se nome non matcha).
- [ ] Commit `feat(booking): Notorious, The Space, Cinelandia`.

### Task 4: cascata per spettacolo in `links.ts` + MyMovies + tipo `Showing`

**Files:** modify `src/lib/cinema/types.ts` (`Showing.bookingLevel: 2 | 1 | 0`), `links.ts`, `mymovies/showtimes.ts`, `mock.ts` e `movieglu-showtimes.ts` (aggiungono `bookingLevel: 0`), `plans.ts` (`PlanInput.bookingLevel`, colonna non salvata: la CTA in home usa il testo generico "Biglietti").

`links.ts`:
```ts
export interface ShowingLinkQuery { cinema: Cinema; times: string[] /* HH:MM */ }
export async function resolveShowingBookingLinks(
  queries: ShowingLinkQuery[], film: { title: string; originalTitle: string | null }, date: string,
): Promise<Map<number /* cinema id */, { byTime: Map<string, BookingLink>; fallback: BookingLink }>>
```
Cascata: manual (da `resolveCinemaSites`, `source === "manual"` → level 1 per tutti gli orari) → `resolveChainLinks` (solo se `chainFor`) → sito (`sites.get`) → catena home → Google; `fallback.level` = 1 per manual/chain level 1, 0 per gli altri. `mymovies/showtimes.ts`: `toShowings(showings, links)` cerca `byTime.get(s.time)` altrimenti `fallback`; `filmShowtimes` e `cinemaProgramme` chiamano la nuova funzione (in `cinemaProgramme` una query per film: `Promise.all` sui film, il resolver è cached).

- [ ] typecheck/lint/test; commit `feat(cinema): link biglietteria per spettacolo (livello 1/2)`.

### Task 5: migration 0016 + tipi DB + Server Actions biglietti

**Files:** create `supabase/migrations/0016_cinema_tickets.sql`, `src/lib/cinema/tickets.ts`; modify `src/types/database.ts`, `plans.ts` (`cancelPlan` rimuove `ticket_path`), `queries.ts`.

SQL come da spec (colonne + bucket + 4 policy). Applicare via MCP `apply_migration` nome `0016_cinema_tickets`.

```ts
// tickets.ts ("use server")
export interface TicketResult { ok: boolean; error?: string }
export async function attachTicket(planId: string, input: { codes: string[]; path: string | null }): Promise<TicketResult>
export async function removeTicket(planId: string): Promise<TicketResult>
```
Validazione: uuid v4 regex; `codes` ≤ 10, stringhe ≤ 2048, dedupe; `path` null o `^${uid}/${planId}/[A-Za-z0-9._-]+$`. Update con `.eq("user_id", uid)`; `removeTicket` legge `ticket_path`, `supabase.storage.from("tickets").remove([path])`, poi azzera. `revalidatePath("/")`.

`queries.ts`:
```ts
export interface UpcomingPlan { plan: PlanRow; ticketUrl: string | null }
export async function getUpcomingPlan(): Promise<UpcomingPlan | null>
```
`ticketUrl` = `createSignedUrl(ticket_path, 3600)` solo se `ticket_path`.

- [ ] Commit `feat(cinema): biglietti su cinema_plans + bucket tickets`.

### Task 6: decodifica QR client + dipendenze

**Files:** `package.json` (`pnpm add jsqr qrcode pdfjs-dist && pnpm add -D @types/qrcode`), create `src/lib/qr/decode.ts`.

```ts
export interface DecodedTicket { codes: string[] }
export async function decodeTicket(file: File): Promise<DecodedTicket>
```
- `scanCanvas(ctx, w, h)`: loop ≤ 4: `jsQR(imageData, w, h, { inversionAttempts: "attemptBoth" })`; se trovato → push `data`, riempi di bianco il quadrilatero `location` (bounding box) e ripeti.
- immagini: `createImageBitmap(file)` → scala lato lungo ≤ 1600 → scan; se vuoto riprova a 0.5× e 2× (limite 3200).
- PDF: `const pdfjs = await import("pdfjs-dist"); pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();` pagine 1–3, `getViewport({ scale: 2 })`, `render({ canvasContext, viewport }).promise`, scan.
- dedupe, `slice(0, 10)`, `code.slice(0, 2048)`.

- [ ] `pnpm build` verde (verifica che il worker venga emesso come asset; se Turbopack/webpack non risolvono `new URL`, copiare `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` in `public/pdf.worker.min.mjs` con uno script `scripts/copy-pdf-worker.mjs` in `prebuild` e usare `workerSrc = "/pdf.worker.min.mjs"`).
- [ ] Commit `feat(qr): lettura QR da immagine e PDF`.

### Task 7: TicketQr, QrFullscreen, TicketImport

**Files:** create `src/components/cinema/TicketQr.tsx`, `QrFullscreen.tsx`, `TicketImport.tsx`; `icons.tsx` aggiunge `qr`, `upload`, `close`.

- `TicketQr({ codes, originalUrl })`: per ogni codice `QRCode.toDataURL(code, { margin: 2, errorCorrectionLevel: "M", width: 512 })` in `useEffect` → `<img>` 120px su fondo bianco arrotondato; tap → `QrFullscreen`.
- `QrFullscreen({ open, onClose, codes, originalUrl })`: portal, `fixed inset-0 z-[60] bg-white text-black`, riga scorrevole snap con un QR a schermo (`min(88vw, 480px)`), codice in `text-[11px] font-mono` sotto, link "Vedi originale" se `originalUrl`, bottone Chiudi in alto, Escape.
- `TicketImport({ planId, userId, onDone })`: `<input type="file" accept="image/*,application/pdf" hidden>`; flusso: upload originale (`createClient().storage.from("tickets").upload(`${userId}/${planId}/${Date.now()}.${ext}`, file, { contentType: file.type })`) → `decodeTicket(file)` → `attachTicket`; stati "Carico…"/"Leggo il QR…"; toast esiti; `router.refresh()`.

- [ ] Commit `feat(cinema): componenti QR e caricamento biglietto`.

### Task 8: `TicketShape` + `Sheet size` + `TicketSheet`

**Files:** modify `src/components/ui/Sheet.tsx` (`size?: "auto" | "tall"`: classe `h-[min(90svh,900px)] flex flex-col` e wrapper contenuto `min-h-0 flex-1 overflow-y-auto`); create `TicketShape.tsx`; rewrite `TicketSheet.tsx`.

`TicketShape` props: `{ backdropPath, posterPath, title, titleHref?, eyebrow?, time, dateLabel, formatLabel?, cinemaName, cinemaLine, rightMeta?: ReactNode, children }`. Struttura: `<article className="overflow-hidden rounded-[24px] border border-border bg-surface">` → header `relative aspect-video` con `<Image fill sizes="(min-width:480px) 480px, 100vw" quality={95} object-cover>` + velo `bg-gradient-to-t from-surface via-surface/60 to-transparent` + titolo in basso; corpo `p-5`: `time` 40px bold tracking -0.04em, `dateLabel` muted, badge formato, riga cinema; perforazione: `<div className="relative my-1 border-t border-dashed border-white/15"><span class="absolute -left-[13px] -top-[13px] size-[26px] rounded-full bg-bg"/><span … -right-[13px]/></div>`; tagliando `p-5 pt-4` con `children`.

`TicketSheet`: `Sheet size="tall"` senza `title`; `TicketShape` con `time = formatTime(showing.start)`, `dateLabel = formatShowingDate(showing.start)`, `rightMeta` = countdown; tagliando con: stato `saved` (planId+undo) → "Serata salvata ✓" + `TicketImport` + "Invita amici"; altrimenti CTA link (`showing.bookingLevel === 2 ? "Scegli i posti" : "Compra i biglietti"`), "Ci vado" (`planShowing`, poi `setSaved`, toast con Annulla che chiama `cancelPlan` e `setSaved(null)`), "Invita amici". Serve `userId` per il path storage: `ShowtimesClient`/`VenuesView`/`FilmsView` ricevono `viewerId` dalle pagine (`getViewer()`), passato a `TicketSheet`.

- [ ] typecheck/lint/build; commit `feat(cinema): foglio biglietto a forma di ticket`.

### Task 9: `PlanCard` a forma di ticket + `TonightAtCinema`

**Files:** rewrite `PlanCard.tsx` (prop `{ plan, ticketUrl, userId }`), modify `TonightAtCinema.tsx` (nuovo `getUpcomingPlan`, `getViewer()` per `userId`).

Tagliando: se `ticket_codes.length` → `TicketQr` + "Rimuovi" (`removeTicket`); else se `ticketUrl` → `<img src={ticketUrl}>` (max-h 240, tap → `QrFullscreen` con solo originale); else `TicketImport`. Bottoni "Biglietti"/"Indicazioni" sotto; stato `afterShow` invariato (senza tagliando QR).

- [ ] Commit `feat(cinema): promemoria in home a forma di biglietto con QR`.

### Task 10: verifica Playwright + docs

- [ ] `pnpm build && next start -p 3011`; script scratchpad `ticket-check.mjs`: login zapptest, `/cinema?view=films`, tap primo orario → screenshot foglio (mobile 390 e desktop 1440); "Ci vado" → tagliando con "Aggiungi il biglietto"; genera PNG QR con `qrcode` (`toFile`) e `setInputFiles` → attesa toast → `/` → screenshot card, `img[alt^="QR"]` presente; tap QR → overlay; `removeTicket` via UI; `cancelPlan` alla fine. Log server `[booking]` per URL UCI/Notorious.
- [ ] Aggiornare `CLAUDE.md` sezione Cinema (booking, tickets, TicketShape); commit `docs(cinema): biglietti`.

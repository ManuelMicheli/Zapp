# Zapp Mobile — Fase 2: condividi in Zapp (share sheet in entrata). Piano di esecuzione

> **Per gli agenti esecutori:** SUB-SKILL RICHIESTA: superpowers:subagent-driven-development.
**Spec:** docs/superpowers/specs/2026-09-12-zapp-mobile-design.md (§1.5, §1.2, §2). Piano generale: docs/superpowers/plans/2026-09-12-zapp-mobile-fase-0.md §3, §5.

**Obiettivo:** da Netflix, Prime Video, Disney+, NOW, IMDb, TMDB o da un testo qualsiasi, "Condividi → Zapp" apre la scheda del titolo giusto con il menu "Aggiungi" gia' aperto; se il titolo non e' certo, una pagina "Quale intendevi?" con le proposte.

**Architettura (adeguata ai fatti del codice, 2026-09-13):**
- Guscio: `expo-share-intent` v8 (SDK 57). Alla ricezione manda `sharedContent {url?, text?}` alla pagina se il ponte e' vivo, altrimenti naviga direttamente a `/share/incoming?url=…&text=…`.
- Web: `NativeBridge` porta `sharedContent` su `/share/incoming` (pagina sotto `(app)`: login, onboarding e consensi gratis dal layout; se non loggati la query si perde: accettato, nella WebView si e' sempre loggati).
- Risoluzione in tre strati: (1) **parser puro** `src/lib/share/parse-shared.ts` (URL → bersaglio: piattaforma+URL canonico | imdb | tmdb | testo); (2) **risolutore server** `src/lib/share/resolve.ts`: piattaforma → `title_provider_links.url` (indice nuovo, migration `0049_share_url_index.sql`), imdb → `findByImdb` esteso alle serie, tmdb → diretto, testo → `searchMulti` + **scelta pura** `src/lib/share/choose.ts` (match esatto normalizzato, anno nel testo, risultato unico); (3) la pagina: redirect a `/title/<mt>/<id>?from=share`, oppure il picker, oppure "Non trovato" con link alla ricerca.
- Scheda titolo: `?from=share` → `TitleActionsBar` apre il menu "Aggiungi" (prop `autoOpen` da pagina → TitleBody → TitleActions → TitleActionsBar), poi pulisce l'URL.
- Rate limit `share:${user.id}` 30/60 s `condiviso: true` (chiama TMDB).

**Vincoli globali:** spec §2. In piu': niente chiamate TMDB dal client; testi UI in italiano; il parser e la scelta sono puri e coperti da Vitest; l'URL condiviso non si logga per intero (puo' contenere tracking); `protocol.ts` non cambia (il messaggio `sharedContent` esiste gia' in entrambe le copie).

## Task (2.1 → 2.2 → 2.3 in sequenza nel worktree Zapp; 2.4 in parallelo nel repo mobile; 2.5 in coda)

### 2.1 (Opus) — Parser puro `parse-shared.ts` + scelta pura `choose.ts` (TDD)
### 2.2 (Opus) — Migration indice URL, `resolve.ts`, pagina `/share/incoming` (redirect/picker/non trovato), `NativeBridge` → pagina, `TmdbFindResult.tv_results`
### 2.3 (Sonnet) — `?from=share` apre il menu "Aggiungi" nella scheda titolo
### 2.4 (Opus) — ZappMobile: `expo-share-intent`, consegna al ponte o navigazione diretta
### 2.5 (Sonnet) — docs (`mobile.md`, `provider-links.md` una riga), gate di fase

## Interfacce vincolanti

```ts
// src/lib/share/parse-shared.ts (puro)
export type SharedTarget =
  | { kind: "provider"; providerId: 8 | 119 | 337 | 39; urls: string[] } // 1-2 forme canoniche, come in title_provider_links (Prime: gti + ASIN)
  | { kind: "imdb"; imdbId: string }                                     // tt1234567
  | { kind: "tmdb"; mediaType: "movie" | "tv"; id: number }
  | { kind: "text"; query: string; year: number | null };
export function parseShared(input: { url?: string; text?: string }): SharedTarget | null;
export function textQuery(text: string): { query: string; year: number | null } | null; // toglie URL, "Guarda … su Netflix", spazi; max 120 char

// src/lib/share/choose.ts (puro)
export type Candidate = { id: number; mediaType: "movie" | "tv"; title: string; originalTitle?: string | null; year: number | null; popularity?: number };
export function chooseCandidate(query: string, year: number | null, candidates: Candidate[]): { sure: Candidate | null; shortlist: Candidate[] };
// sure = match esatto normalizzato (accenti/punteggiatura/case) con anno compatibile se dato, oppure unico candidato; shortlist = fino a 5

// src/lib/share/resolve.ts (server-only)
export type ShareResolution =
  | { status: "found"; mediaType: "movie" | "tv"; id: number }
  | { status: "choose"; query: string; options: Candidate[] }
  | { status: "none"; query: string | null };
export async function resolveShared(target: SharedTarget): Promise<ShareResolution>;

// pagina: src/app/(app)/share/incoming/page.tsx — searchParams { url?, text? } → parseShared → rateLimit → resolveShared → redirect(`/title/${mt}/${id}?from=share`) | <SharePicker> | <ShareNotFound>
// scheda: searchParams.from === "share" → autoOpen="add" (TitleBody → TitleActions → TitleActionsBar)
// guscio: useShareIntent() → { webUrl, text } → sendToWeb({ type: "sharedContent", url, text }) se pronta, altrimenti navigate(`/share/incoming?…`); resetShareIntent()
```

## Verifica di fase
1. `pnpm test` (parser + scelta), `typecheck`, `lint`, build isolata.
2. In browser (istanza locale, loggati): `/share/incoming?url=https://www.netflix.com/title/80057281` (Stranger Things, se in `title_provider_links`) → scheda con menu aperto; `?url=https://www.imdb.com/title/tt0903747/` → Breaking Bad; `?text=Guarda%20Dark%20su%20Netflix` → Dark; `?text=zzzz` → non trovato.
3. Telefono (dopo build): da Netflix "Condividi" → Zapp → scheda con "Aggiungi".

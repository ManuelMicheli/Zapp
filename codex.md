# Zapp — memoria operativa del progetto

Ultima revisione: 2026-09-09. Documento creato dopo un'ispezione locale di sola lettura; unica scrittura della sessione: questo file. Nessuna modifica al sito, nessuna build, migration, chiamata ai servizi o pubblicazione. Stato remoto e resa nel browser non verificati in questa sessione.

## Come usare e aggiornare questo riferimento

- Leggere questo file all'inizio del lavoro e consultare le sezioni pertinenti di `CLAUDE.md`, i sorgenti e i mockup. Questo file è memoria su disco, non una promessa di memoria persistente o di caricamento automatico.
- Dopo le sessioni aggiornare le parti effettivamente cambiate: decisioni dell'utente, comportamento corrente, componenti, estetica, automazioni, verifiche e questioni aperte. Sostituire le informazioni superate; non accumulare istruzioni contraddittorie.
- Le richieste dell'utente prevalgono. Per sapere cosa è implementato, verificare il codice corrente: `CLAUDE.md` contiene anche descrizioni storiche; le specifiche descrivono talvolta lavoro futuro.
- Non trasformare un'ispezione in un intervento. Nella sessione iniziale l'utente ha autorizzato soltanto lettura e creazione di `codex.md`.
- Il workspace aveva già molte modifiche e file non tracciati: non ripristinarli, formattarli o includerli indiscriminatamente in commit. Controllare sempre lo stato Git iniziale.

## Prodotto e identità

Il nome nel codice e nei metadati è **Zapp** (l'utente usa anche ZAP/zap). È una PWA mobile-first, in italiano, per scoprire film e serie, sapere dove guardarli in Italia, tenere una libreria e il progresso di visione, condividere attività con gli amici e organizzare una serata al cinema.

Zapp apre le piattaforme ufficiali: non riproduce film o episodi e non esegue scraping delle piattaforme streaming. I trailer ufficiali sono fondali della UI. Il simbolo distintivo è la **Z** originale del marchio.

Direzione richiesta dall'utente: **coerenza estetica, qualità premium, atmosfera cinematografica e “Awwwards vibe”**. Interpretarla attraverso il linguaggio già presente: immagini curate, gerarchia tipografica, respiro, profondità del vetro e movimento misurato. Non è un invito a introdurre effetti o stili estranei.

## Design system: vincoli prioritari

Fonte dei token: `src/app/globals.css`. Font: **Inter variabile 100–900**, self-hosted in `public/fonts/inter-var.woff2`, caricata con `next/font/local` in `src/app/layout.tsx`. HTML italiano, dark-only, fondo e theme-color neri.

| Token | Valore | Uso |
| --- | --- | --- |
| `bg` | `#000000` | Fondo nero puro |
| `surface` | `#0e0e12` | Superfici |
| `surface-2` | `#1c1c1e` | Superfici secondarie |
| `sheet` | `#0a0a0c` | Fogli |
| `border` | bianco 7% | Bordi discreti |
| `text` | `#ffffff` | Testo principale |
| `muted` / `muted-2` | `#8e8e93` / `#6e6e73` | Testi secondari |
| `accent` / `accent-light` | `#c5baf4` | Lavanda chiaro |
| `accent-strong` | `#a596e8` | Accento più marcato |
| `accent-soft` | `#d3cbf8` | Link e dettagli |
| `accent-pale` | `#e3defb` | Dettagli chiari |
| `danger` | `#f87171` | Errori e azioni distruttive |

- Usare i token, non aggiungere hex arbitrari. Eccezioni previste: colori dei marchi e generi (`src/lib/genre-colors.ts`, configurazione provider).
- **Nessun pieno viola saturo** come nuovo stile di CTA. Il primario è `.glass-accent`: gradiente lavanda traslucido verso grigio, bordo lavanda tenue, blur 16px, luce interna e ombra nera. Riferimento visivo: “Tutta la programmazione”.
- `.glass`: bianco 10%, bordo bianco 14%, blur 16px. `.glass-strong`: fondo scuro 72%, blur 24px, bordo tenue e ombra profonda.
- `Button`: pillola, altezza 54px, testo 17px semibold; varianti primary/secondary/ghost/danger. Riutilizzare `src/components/ui/` e `GlassIconButton`.
- Card standard: raggio 20px, bordo `border-border`, `bg-surface`. Campi standard: raggio 14px. **Auth/onboarding fanno eccezione**: campi traslucidi definiti in `src/components/auth/field.ts`, non superfici piatte.
- Nessuna libreria UI o icone esterna. SVG inline, `currentColor`, tratto 1.8; nav mobile con le maschere del set originale del brand.
- Tipografia con gerarchia reale: titoli ampi, tracking curato, testi leggibili; countdown e orari grandi e leggeri, cifre tabulari. Aumentare proporzionalmente testo, avatar e spazi nelle card desktop.
- Movimento esistente: Framer Motion e animazioni CSS. Rispettare reduced-motion; trailer rispettano anche Save-Data. Non sostituire la libreria di animazione per iniziativa propria.
- Evitare blur sul contenitore di elementi animati. Il muro applica il blur alle colonne già composte; scaffali e griglie usano `.cv-auto` per limitare layout/paint fuori schermo.

### Immagini, sfondi e trailer

- Locandine e backdrop sono parte centrale dell'identità, non decorazioni intercambiabili. Il marchio originale è in `docs/design/brand/`; mockup e copy di riferimento in `docs/design/mockups/`. Confrontare sempre i mockup con le decisioni successive e il codice corrente.
- Backdrop cinematografici in TMDB `original`; banda titolo e banner cinema usano `unoptimized` dove previsto per evitare riduzioni indesiderate. Altrove `sizes` deve rappresentare la geometria reale e il crop.
- Il loader `src/lib/image-loader.ts` sceglie le dimensioni TMDB senza usare l'ottimizzatore Vercel: serve a evitare il precedente esaurimento quota immagini Hobby. Non ripristinare `/_next/image` accidentalmente.
- `PosterWall`: muro prospettico di locandine, loop continuo senza buchi, colonne adiacenti diverse; mobile 4 colonne, desktop fluido con 20 dove previsto. Immagini eager; reduced-motion ferma il muro.
- `AmbientBackdrop`: colori realmente estratti dalla locandina tramite `src/lib/colors/palette.ts` e `dominant.ts`. **Bianchi, grigi e neri devono mantenere il loro peso**; non trasformare ogni pagina in un alone viola o nel colore di un dettaglio minuscolo. Serie e stagioni condividono la palette della serie.
- Palette in cache 30 giorni; al cambiare dell'algoritmo aggiornare `PALETTE_EPOCH`. `scripts/palette-preview.ts` confronta locandina e sfumatura per la verifica visiva.
- Scheda titolo/stagione: banda 16:9 sotto `lg`, 75svh da `lg`, uguale con o senza trailer. Trailer **intero**, senza crop/zoom dell'immagine reale, nero dove non arriva. Titolo e poster sotto la banda; nessun velo colorato sopra il video. Quote e safe-area: riusare le costanti `BAND_*` e `HEADER_*` di `TitleHeader.tsx`, non ricopiare numeri dalle note storiche.
- Solo trailer italiani di canali ufficiali, risolti da `src/lib/trailers/official.ts`; fallback = backdrop. Nessun pulsante che porta a YouTube. Attendere riproduzione e qualità prima della dissolvenza; preservare gestione audio, qualità e fallback iOS.
- Preview home desktop: intenzione hover 600ms, solo mouse fine da 1024px, portal su body, fetch su intenzione e cache di sessione. Qui il trailer riempie il riquadro con crop, a differenza della scheda titolo. Non applicarla indiscriminatamente a tutte le pagine.

### Layout, navigazione e coerenza fra pagine

- Unica `TopNav`: **Cerca, Libreria, Home, Cinema, Profilo**, Z al centro. Mobile in basso con icone, desktop da `lg` in alto con testo; nessuna sidebar e nessun wordmark extra nell'app autenticata.
- Altezza/spazi: `--nav-top` 0/72px, `--nav-bottom` 84/0px, `--nav-actions` 108/0px (mobile/desktop). Rispettare safe-area e spazio per domanda del giorno + campanella; non sovrapporre titoli e campi a queste azioni.
- Cinque tab = radici senza indietro; pagine secondarie con indietro e breadcrumb pertinente. Amici si raggiunge dal Profilo, anche senza amici (“Trova i tuoi amici”).
- `PageShell` diventa fluido da `md`; desktop sfrutta la larghezza, normalmente `lg:px-10`. Non confinare tutta l'app in una colonna telefonica da 480px. I fogli modali mantengono invece il proprio limite.
- Auth, signup e onboarding condividono `AuthShell`: muro + vetro mobile, desktop due colonne circa 75/25 con pannello plain. Il vetro lascia vedere il muro dietro.
- Skeleton `loading.tsx` coerenti con la geometria reale. Toast, import chip e barra azioni titolo restano sopra la nav inferiore.
- Feed e notifiche: una colonna di banner cinematografici a ogni larghezza, 16:9 mobile / 21:9 desktop; limiti di larghezza dedicati, non griglie a più colonne. Profilo amico riusa i componenti del proprio profilo.

## Stack e mappa del repository

Versioni lette dal manifest locale: Next.js **15.5.25**, React **19.1.0**, TypeScript strict, Tailwind CSS 4, Framer Motion 13, Supabase SSR/Postgres/Auth/RLS, TMDB v3, Serwist, pnpm, Vercel. Versioni future: controllare `package.json` e lockfile.

| Percorso | Responsabilità |
| --- | --- |
| `src/app/(auth)` | Login e signup |
| `src/app/(app)` | Pagine protette e layout condiviso |
| `src/app/onboarding`, `auth/callback` | Completamento profilo e callback auth |
| `src/app/api` | Search, proxy TMDB allowlist, comuni, preview |
| `src/app/go` | Risoluzione e redirect alle piattaforme |
| `src/components` | UI suddivisa in home, title, cinema, social, profile, daily, auth, layout, import |
| `src/lib` | Logica di dominio, letture, Server Actions, integrazioni e funzioni pure |
| `src/types/database.ts` | Tipi Supabase e helper `Tables`/`Enums` |
| `supabase/migrations` | Schema, policy, trigger e RPC |
| `scripts` | Generatori, manutenzione e verifiche mirate |
| `public` | Font, icone, avatar, immagini email e asset serviti |
| `docs/design` | Sorgenti brand, mockup e dati di riferimento |
| `docs/superpowers/specs`, `plans` | Decisioni e piani: non prova di implementazione |
| `docs/auth` | Modelli email e configurazione marchio auth |

Alias `@/*` → `src/*`. Server Components come default; `server-only` per integrazioni/letture riservate, `"use server"` per azioni. UI e commenti in italiano. Prettier: doppi apici, trailing commas, larghezza 90.

Rotte principali: `/`, `/search`, `/library`, `/cinema`, `/profile`, `/friends`, `/notifications`, `/discover`, `/u/[username]`, `/import/netflix`, `/title/movie/[id]`, `/title/tv/[id]`, `/title/tv/[id]/season/[n]`. Il profilo “pubblico” è comunque dentro l'app autenticata e soggetto a privacy/RLS.

## Funzionalità e invarianti

- **Home corrente** (`src/app/(app)/page.tsx`): filtro Tutto/Film/Serie e generi, hero/carousel, Continua o invito piattaforme, Top Ten, serata/cinema, Perché hai guardato, amici, lista/novità, Per te, voti alti, In arrivo. Il filtro è condiviso via `HomeTypeProvider`; cinema nascosto sotto Serie. Non ripristinare la vecchia home descritta in alcune note.
- **Continua**: artwork ufficiale della serie/film a rotazione, non still dell'episodio; testo e progresso si riferiscono all'episodio da riprendere. Risoluzione delle immagini e stagioni dietro Suspense.
- **Tracking**: azioni in `src/lib/watch/actions.ts`, undo con snapshot validato, revalidate delle pagine interessate. `last_watched_at` rappresenta la visione reale; voto/privacy/Da vedere non la devono alterare.
- **Libreria**: 60 elementi per pagina; liste con colonne esplicite, mai `titles.raw` per ogni riga. Statistiche profilo tramite RPC snella. Stagioni da colonna generata dove possibile.
- **Scheda titolo**: su mobile azioni, trama, voti/recensioni, piattaforme, cinema o riprendi, stagioni, cast, amici, simili, scheda tecnica. Desktop due colonne, cast nella stretta, orari nella larga. Generi in testo maiuscoletto sopra il titolo, non nuove pillole.
- **Piattaforme**: link al titolo esatto quando disponibile; cascata manual → JustWatch → Wikidata → ricerca. Non etichettare un fallback ricerca come “Apri”: usa “Cerca”. `AppLink` centralizza apertura app native; Disney+ ha gestione specifica Android/iOS. Non sovrascrivere override manuali.
- **Ricerca**: endpoint server, debounce 60ms, abort e cache client; provider in query batch. Storico dei titoli aperti in `search_history`, pannello solo a campo vuoto e con focus; niente localStorage.
- **Social**: amicizie, blocchi, consigli, attività, like, notifiche, recensioni e segnalazioni. Attività prodotte da trigger DB. La moderazione va garantita dalla RLS, non soltanto dal filtro UI.
- **Avatar**: 18 silhouette bianche trasparenti, sfondo scelto dall'utente codificato nell'URL del preset; foto caricate separate. Riutilizzare parser e rendering comuni.
- **Chicche**: recensioni di personaggi in coda alle recensioni vere, stessa veste, testo bianco uniforme, senza badge speciale. Dati statici in `src/lib/easter-eggs/`; citazione verificata e contenuta letteralmente nel testo, voto coerente, link all'opera/stagione di origine.
- **Cinema**: `CINEMA_SOURCE=mymovies` default; alternative mock/movieglu/off. MyMovies offre oggi, non date future. Raggio 25km, comuni italiani nel dataset locale, GPS facoltativo. Copertura include capoluogo, provincia e sale note delle province vicine. Preferiti massimo 3.
- **Serata**: “Ci vado”, inviti, deep link biglietteria per spettacolo ove possibile; acquisto fuori app. Biglietti PDF/immagine in bucket privato, decodifica QR nel browser, originale come fallback, posti/sala, schermo scansione con Wake Lock. Dopo il film proposta visto/voto. Nessuna disponibilità posti live.

## Automazioni effettive e manutenzione

| Meccanismo | Attivazione e limiti |
| --- | --- |
| Cache TMDB | Richieste server con TTL, memo in-process e deduplica; throttle 15/s. Titoli DB 7 giorni, fallback stale, `TITLE_CACHE_EPOCH` quando cambia il payload richiesto |
| Link streaming | Resolver su richiesta, cache link diretti 30 giorni, fallback ricerca ritentato giornalmente, manuale intoccabile |
| Trailer | DB-first, cache piena 30 giorni / vuota 1 giorno; ricerca YouTube opzionale, allowlist ufficiale e verifica lingua |
| Cinema | Fetch server MyMovies con throttle 4/s e stop 60s dopo 403/429; programmazione 30min, indici 6h, dati stabili 30 giorni |
| Import Netflix | Parsing CSV, poi riconoscimento e scrittura in background nel provider React. Chunk match 30, conferma 25, concorrenza match 3; nessuna schermata revisione. Vive finché l'app resta aperta, non è una coda server |
| Merge import | RPC idempotente, conserva voti e aggiorna progresso più avanzato; date dal CSV, niente spam nel feed grazie a `zapp.skip_activities` |
| Social e moderazione | Trigger attività/notifiche/conteggi segnalazioni; RLS e ownership restano difesa effettiva |
| Domanda del giorno | Domande precompilate, giorno Europe/Rome, una risposta modificabile fino a mezzanotte. Podio ieri calcolato/cacheato su richiesta, **nessun cron necessario**; visto salvato nel DB |
| PWA | `pnpm build` genera `public/sw.js`; precache e cache immagini TMDB (300, 30 giorni). SW disabilitato in dev |
| PDF worker | `copy-pdf-worker.mjs` eseguito esplicitamente prima di dev/build; copia worker e wasm same-origin |

Script manuali (non sono job programmati):

- `set-link.ts`, `set-cinema-link.ts`: override persistenti dei link.
- `warm-cinema-venues.ts`: catalogo nazionale sale, richieste distanziate 700ms, stop su blocco.
- `seed-daily-questions.ts`: 80 domande da domani, idempotenza su data; finite le domande spariscono icona e popup.
- `generate-icons.mjs`, `generate-nav-icons.mjs`, `generate-avatars.mjs`, `fetch-chain-logos.mjs`: asset; preservare sorgenti e scala uniforme delle icone. Incrementare versione manifest quando cambiano icone PWA.
- `auth-emails.mjs`: genera sei template italiani; `--push` modifica il servizio remoto. `email-wall.mjs`: genera GIF del muro via Chrome/ffmpeg in `public/email/`.
- `palette-preview.ts`, `security-check.mjs`, `nav-check.mjs`, `daily-question-check.mjs`: verifiche mirate. Alcuni check creano e cancellano utenti/dati: leggere lo script prima di eseguirlo.

**Automazioni pianificate, non confermate attive:** nel tree ispezionato non ci sono `src/app/api/jobs`, `src/lib/jobs`, `src/lib/scrobble`, `extension/` o `/devices`. `vercel.json` imposta solo la regione `fra1`, nessun cron. Il piano catalogo/ZappScore descrive pg_cron/pg_net/Vault, MDBList e classifiche Netflix/JustWatch; i tipi DB contengono `job_runs`, ma questo non prova l'esistenza di job operativi. Verificare il DB remoto e l'eventuale altro worktree solo quando richiesto.

**ZConnection:** specifiche 2026-09-04 (Android/Fire TV) e 2026-09-09 (estensione browser) in `docs/superpowers/`. È progettazione futura rispetto a questo tree. Pipeline server condivisa, cattura metadati nel companion/estensione, niente credenziali delle piattaforme inviate ai server. Non promettere tracking nativo su Samsung/LG o app iOS. Verificare copertura e stato di realizzazione prima di presentare qualsiasi funzione come disponibile.

## Sicurezza, servizi e prestazioni da preservare

- Tre client Supabase: browser, server legato ai cookie/RLS, service-role per dati di sistema. Nessun service-role per aggirare la privacy degli utenti. `anon` senza accesso allo schema pubblico; pagine senza sessione non leggono dati utente.
- Letture auth con `getViewer()` / `getViewerProfile()` e React cache, JWT verificato con `getClaims()`; `getUser()` nei percorsi che scrivono. Onboarding richiesto prima dell'app. Non inserire logica tra creazione client middleware e `getClaims()`.
- Ogni Server Action è un endpoint: validazione centralizzata in `src/lib/validate.ts`, ownership esplicita, rate limit, errori generici verso client. Snapshot undo non fidati. URL esterni HTTPS pubblici; callback `next` validato.
- Policy UPDATE con `with check`, parti amicizia immutabili, grant per colonna, trigger non eseguibili via RPC pubbliche. Non concatenare input nei filtri PostgREST.
- Audit 0020/0021: `reviews_with_counts` security invoker, moderazione nella RLS. Le vecchie note social/README che parlano solo di filtro query o della vista come definer sono superate.
- TMDB solo server o proxy allowlist; nessuna chiamata client diretta con token. Config centrale in `src/lib/config.ts`, cache e mapping in `src/lib/tmdb/`.
- Funzioni Vercel `fra1`, vicine al DB europeo. Conservare query parallele, Suspense, payload snelli e cache router (`staleTimes` 30/300s). Non aggiungere fetch completi per ogni risultato/scaffale.
- CSP/header in `next.config.ts`: YouTube nocookie esplicitamente permesso per iframe/autoplay/fullscreen, wasm per PDF, font self-hosted. Eccezione CORP cross-origin solo `/email/`. Non semplificare queste regole senza verificare i flussi che proteggono.
- Segreti solo in env, mai in questo file. Elenco variabili in `.env.example`; `.env.local` non letto nell'ispezione. Token TMDB e service-role esclusivamente server.
- Auth branding Google e SMTP sono configurazioni esterne. `docs/auth/README.md` riporta un blocco ai template con provider email incluso sul piano free verificato il 2026-09-09: è una nota storica da ricontrollare prima di intervenire, non stato remoto verificato oggi.
- Attribuzione TMDB da conservare nel profilo e dove prevista.

## Verifiche da scegliere nelle prossime sessioni

Comandi disponibili: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format`. Dev/build scrivono asset PDF e build; format modifica i sorgenti. Non eseguirli per una semplice ispezione.

- Per modifiche funzionali: test pertinenti delle funzioni pure, typecheck/lint/build secondo l'impatto. La suite Vitest corrente è più ampia dell'elenco iniziale di `CLAUDE.md`; trovare i `*.test.ts` del dominio.
- Per UI: verificare mobile, tablet, desktop ampio; gerarchia, palette, immagini nitide, safe-area, nav, overlay, skeleton e reduced-motion. Confrontare pagine affini, non soltanto il componente modificato.
- PDF/QR: verifica WebKit obbligatoria, non solo Chrome; preservare `pdf-polyfills.ts`. Per qualità trailer usare Chrome reale: il Chromium di test può offrire qualità diversa.
- CSP/auth/nav: check dedicati contro istanza scelta consapevolmente; attenzione al service worker vecchio e all'overlay domanda del giorno nei test browser.
- Non eseguire due build nello stesso distDir. `NEXT_DIST_DIR` permette una cartella dedicata; non eliminare le molte `.next-*` preesistenti per pulizia occasionale.
- Migration: confrontare prima stato locale/remoto. Diverse migration risultano già applicate secondo `CLAUDE.md`; ci sono due file col prefisso `0019`, e i numeri dei vecchi piani possono confliggere con quelli reali. Niente `supabase db push` alla cieca. Dopo variazioni schema aggiornare tipi e verificare advisor/RLS.

## Checklist di chiusura sessione

- Registrare data, obiettivo e decisioni nuove dell'utente nelle sezioni pertinenti.
- Aggiornare percorsi, comportamento e stato delle automazioni solo con evidenze.
- Conservare palette/font/brand e le regole specifiche già approvate; documentare eventuali cambi esplicitamente richiesti.
- Distinguere implementato localmente, testato, pubblicato e soltanto progettato.
- Scrivere verifiche effettivamente eseguite e limiti ancora aperti; non chiamare “verificato” ciò che è soltanto descritto in una spec.
- Controllare il diff finale: soltanto file necessari alla richiesta, nessuna modifica preesistente annullata.

Registro iniziale — 2026-09-09: lettura di `CLAUDE.md`, inventario struttura, configurazione, token e componenti principali; ricognizione script, migration e specifiche automazioni. Creato questo riferimento; sito e configurazioni lasciati invariati. Nessun test runtime o verifica remota eseguito.

### Progettazione profilo — 2026-09-09

- Decisione esplicita dell'utente: riprogettare **solo da “Le tue statistiche” in giù**, su mobile e desktop. La testata superiore con i poster che scorrono piace e va preservata.
- Tre proposte visive in `docs/design/mockups/profile-directions/profilo-{a,b,c}.html`: A equilibrio cinematografico, B ritratto editoriale, C collezione. Ogni proposta include una versione mobile espandibile. Locandine locali del progetto; statistiche e voti dimostrativi, non dati del profilo reale.
- Nessuna direzione ancora scelta. Mockup di progettazione, non implementazione nel sito; componenti applicativi invariati. Generazione locale completata; nessuna verifica browser o build dell'app eseguita.

### ZConnection automatica — 2026-09-10

- Implementazione effettiva nel worktree `.claude/worktrees/zconn-deploy` (branch `deploy/zconnection`, base `7973b74392597a675b18a6c2a475268f13836299`), non nel tree principale descritto nell'ispezione iniziale. Non sovrascrivere i numerosi cambiamenti preesistenti del tree principale.
- Estensione browser `extension/`, copia installabile `D:\PROGETTI\Zapp-estensione`, versione 1.0.1. Copia aggiornata e hash verificati, backup dei cinque file modificati in `%TEMP%/zconnection-backup-91c2b92a-c296-470b-a079-f2db27a3ee41`. Chiave manifest preservata. Ricaricare una volta l'estensione e Netflix per attivare gli script.
- Cattura automatica sugli eventi del player e navigazione SPA; ritento rapido durante attesa metadati, heartbeat 30 secondi, campione in memoria massimo una volta al secondo, nessun heartbeat su browse. Pausa, seek e uscita salvano l'ultima posizione reale. Protezione da titolo/video vecchio durante autoplay; reiniezione con cleanup.
- Background adotta le schede Netflix aperte dopo avvio/connessione; coda persistente, timeout e retry con backoff, rimuove solo eventi confermati dal server. Richiesta del permesso Netflix nel popup solo se mancante.
- API scrobble conferma individualmente gli eventi, conserva quelli con errori transitori; parsing E5 senza suffisso e inferenza stagione delle miniserie solo quando esiste una sola stagione regolare verificata.
- Continua a guardare usa il punto salvato (stagione/episodio e posizione), mostra `Riprendi da M:SS` o `H:MM:SS`, senza sostituirlo con la durata totale e senza avanzamento simulato. Palette, font e struttura estetica preservati.
- Migration `0037_scrobble_ordered_progress.sql` applicata a Supabase: serializzazione eventi dispositivo/titolo, protezione da eventi arretrati, chiusura corretta sessione stopped. Test SQL reali in transazione con rollback prima dell'applicazione. Tipi rigenerati in file temporaneo e confrontati: firme pubbliche invariate. Advisor consultati: restano segnalazioni preesistenti, non dichiararli tutti puliti.
- Verifiche: 81 test Vitest su tracking/scrobble, 8 test Node dell'estensione, TypeScript, ESLint mirato, build produzione completata, diff check. Nessuna prova nel Netflix reale dell'utente: browser non accessibile agli strumenti della sessione.
- Deploy richiesto esplicitamente dall'utente; escludere `.next*` con `.vercelignore` per evitare upload degli artefatti di verifica oltre 100 MB. Non eseguire una build nello stesso distDir di un server attivo.
- Pubblicazione completata: Vercel `dpl_5XUMAftGcu1r5ANV2oRZ2vfCyyri`, stato Ready, alias `https://zapp-mu.vercel.app`, deploy `https://zapp-lvg3h9mxx-manuel-michelis-projects.vercel.app`. Funzioni confermate in fra1. Smoke test produzione: `/login` 200, POST `/api/scrobble` senza token 401. Build Vercel conclusa con successo.

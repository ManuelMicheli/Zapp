# Conformità legale di Zapp — sottoprogetto 1: fondamenta

Data: 2026-09-12 · Stato: progettato, non implementato

## 1. Perché adesso

Zapp non è più un progetto personale. Misurato il 2026-09-12 sul progetto
Supabase `bbuhwzdbzxgydewmcdwd`:

| | |
| --- | --- |
| utenti registrati | 16 (tutti negli ultimi 30 giorni) |
| entry in libreria | 7.427 |
| dispositivi ZConnection collegati | 13 |
| sessioni di scrobble registrate | 124 |
| recensioni | 6 |

La registrazione è aperta a chiunque (`src/app/(auth)/signup/page.tsx`, nessun
invito obbligatorio). Quindi **non si applica l'esenzione domestica** dell'art.
2(2)(c) GDPR: Zapp tratta dati personali di terzi, in modo regolare e
sistematico, e lo fa già oggi.

Lo stato di partenza, verificato nel codice:

- nessuna informativa privacy (`find src -iname "*privacy*"` → vuoto)
- nessuna condizione d'uso
- nessuna cancellazione account (`grep -rn "deleteAccount"` → 0 risultati)
- nessun export dati
- `user_preferences.personalization_enabled` **default `true`** (migration
  `0024_segnali_utente.sql:16`): profilazione attiva senza che nessuno l'abbia
  chiesta
- `birth_year` raccolto in onboarding (`onboarding/actions.ts:55`) senza finalità
  dichiarata e senza controllo dell'età
- ZConnection registra cosa l'utente guarda su quattro piattaforme senza consenso
  specifico

## 2. Obiettivo

Rendere Zapp conforme a GDPR, Codice Privacy italiano e DSA **senza togliere
nessuna funzionalità**, in particolare senza toccare il comportamento di
ZConnection.

### Non-obiettivi

- Non si costituisce una società: il titolare è una persona fisica.
- Non si implementa il consenso genitoriale per i minori di 14 anni: si blocca la
  registrazione sotto quella soglia.
- Non si introduce un cookie banner: Zapp non ha analytics (verificato: nessun
  `@vercel/analytics`, `gtag`, `posthog`, `plausible`) e il solo cookie è quello
  di sessione, strettamente necessario ex art. 122 Codice Privacy.
- Non rientrano qui il sottoprogetto 2 (ZConnection per lo store) né il 3
  (attribuzioni e fonti terze): abbozzati in appendice A, spec separate.

## 3. Decisioni prese

| Decisione | Scelta | Motivo |
| --- | --- | --- |
| Titolare del trattamento | Manuel Micheli, persona fisica | Progetto non commerciale, nessuna entità esistente |
| Email di contatto | segnaposto `<EMAIL_PRIVACY>` | Da fornire. Sconsigliata la Gmail personale: finisce in una pagina pubblica e viene raccolta per sempre |
| Base giuridica profilazione e scrobbling | consenso esplicito, opt-in | Inattaccabile, nessuna valutazione di bilanciamento da scrivere e difendere |
| Modello del consenso | tabella versionata `user_consents` | L'art. 7(1) chiede di dimostrare il consenso: un booleano non dice a *quale testo* né *quando* |
| Distribuzione estensione | Chrome Web Store | Decisa dall'utente; impone privacy policy pubblica e manifest pulito |
| Monetizzazione | forse in futuro | I documenti nascono già con la clausola di modifica; il conto dei fornitori è in appendice B |

## 4. Architettura

### § 1 — Documenti pubblici

Route group nuovo `src/app/(legal)/` con tre pagine statiche, aggiunte a
`PUBLIC_PATHS` in `src/lib/supabase/middleware.ts`.

**Nessuna di queste pagine legge dal database.** È la regola di `security.md`: da
sloggati non si interroga Postgres, perché il ruolo `anon` non ha grant su
niente. Sono componenti server puri con testo statico, quindi restano
prerenderizzate e non costano una funzione.

- **`/privacy`** — informativa ex art. 13. Sezioni obbligate:
  1. titolare e contatto
  2. quali dati, categoria per categoria, con la fonte di ciascuna
  3. finalità e base giuridica, una riga per finalità
  4. destinatari: l'elenco dei responsabili esterni
  5. trasferimenti extra-UE e garanzia applicabile
  6. tempi di conservazione per categoria
  7. diritti dell'interessato e come si esercitano *dentro l'app*
  8. reclamo al Garante
  9. cookie: solo tecnici, nessun consenso richiesto, con il perché

- **`/termini`** — condizioni d'uso, regole sui contenuti, procedura di
  segnalazione DSA, punto di contatto, legge italiana e foro del consumatore.

- **`/licenze`** — attribuzioni dei terzi e disclaimer sui marchi.

Link da: foglio di login, foglio di signup, footer del profilo, schermata di
consenso di `/devices/connect`.

#### L'inventario dei dati (base per l'informativa)

Ricavato dallo schema, non dalla memoria. 33 tabelle contengono dati riferibili a
una persona. Raggruppate per finalità:

| Gruppo | Tabelle | Fonte del dato |
| --- | --- | --- |
| Identità e account | `profiles`, `user_preferences` | registrazione, onboarding |
| Libreria e visioni | `watch_entries`, `episode_watches`, `imports` | uso dell'app, import CSV Netflix |
| Sociale | `friendships`, `reviews`, `review_comments`, `review_likes`, `title_comments`, `recommendations`, `recommendation_links`, `activities`, `activity_likes`, `notifications`, `title_lists`, `title_list_items`, `title_list_members` | uso dell'app |
| Profilazione | `user_events`, `user_taste`, `user_seed_picks`, `search_history` | telemetria interna, solo con consenso |
| Cinema | `user_locations`, `cinema_favorites`, `cinema_plans` | posizione dichiarata o GPS, biglietti caricati |
| ZConnection | `devices`, `device_members`, `device_profiles`, `watch_sessions`, `watching_now`, `pending_scrobbles` | estensione browser, solo con consenso |
| Gioco | `daily_answers`, `daily_question_views` | uso dell'app |
| Moderazione | `reports` | segnalazioni |

Fuori dal database: gli oggetti nel bucket privato `tickets` (biglietti PDF o
immagini caricati dall'utente, path `{uid}/{planId}/{ts}.{ext}`), che possono
contenere nome, posto e sala.

#### I responsabili esterni da dichiarare

Supabase (database, auth, storage — UE, `eu-central-1`), Vercel (hosting e
funzioni — `fra1`, società USA), Upstash (rate limit condiviso), TMDB (catalogo),
YouTube/Google (trailer incorporati), Open-Meteo (meteo), Nominatim/OpenStreetMap
(geocodifica), MyMovies e le catene cinematografiche (orari).

Distinzione da scrivere con precisione: TMDB, Open-Meteo, Nominatim, MyMovies e
le catene **non ricevono dati personali** — le chiamate partono dal server con
parametri non riconducibili all'utente. Le eccezioni sono due e vanno dichiarate
entrambe: `image.tmdb.org`, contattato dal browser per le locandine, e l'iframe
di `youtube-nocookie.com`, che vedono l'indirizzo IP del visitatore.

### § 2 — Consensi versionati

Migration `0043_consensi.sql` (l'ultima applicata è `0042_title_comments_moderation.sql`).

```sql
create table public.user_consents (
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  kind        text        not null check (kind in ('terms','privacy','personalization','scrobble')),
  version     text        not null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  primary key (user_id, kind, version)
);
alter table public.user_consents enable row level security;
```

Policy, secondo le regole di `security.md` e `scale.md`:

- **una sola policy permissiva per comando** (due si valutano entrambe per riga)
- sempre `(select auth.uid())`, mai `auth.uid()` nudo
- select e insert al solo proprietario
- update consentito al proprietario **sulla sola colonna `revoked_at`** (grant per
  colonna): il testo accettato e la sua data non si riscrivono mai
- nessuna delete: la revoca è una data, non una riga che sparisce
- `anon` revocato su tabella e sequenze

`src/lib/legal/versions.ts`, puro e con test Vitest:

```ts
export const VERSIONI = {
  terms: "2026-09-12",
  privacy: "2026-09-12",
  personalization: "1",
  scrobble: "1",
} as const;
```

Espone `consensiMancanti(righe)` → l'elenco dei `kind` per cui manca una riga
attiva alla versione corrente. `terms` e `privacy` sono **obbligatori**:
mancanti, l'app non si usa. `personalization` e `scrobble` sono **facoltativi**:
mancanti, la funzione resta spenta e basta.

Il gate sta nel layout `(app)`, che già chiama `getViewerProfile()`: si aggiunge
una lettura di `user_consents` nello stesso `Promise.all`, quindi **nessun round
trip in più** (budget di latenza di `auth-routing.md`). Se mancano i consensi
obbligatori si rende un foglio bloccante invece del contenuto.

Quando si aggiorna un documento si alza la costante: tutti rivedono il foglio,
automaticamente, e la vecchia accettazione resta nello storico. È l'unico
meccanismo che risponde alla domanda "a cosa aveva acconsentito questa persona il
giorno X".

### § 3 — Registrazione, onboarding, età

**Al signup** (email e Google): una riga sotto il bottone — "Continuando accetti i
Termini e l'Informativa privacy" — con i due link. Non è il consenso, è
l'informazione preventiva ex art. 13, che deve arrivare *prima* della raccolta.

**Passo 0 dell'onboarding**, nuovo: accettazione esplicita.

- checkbox **non pre-spuntata** (una pre-spuntata non è consenso valido — CGUE
  C-673/17 Planet49); due link che si aprono in scheda nuova
- alla conferma si scrivono le righe `terms` e `privacy`
- solo dopo si passa all'attuale passo 1 (username)

La regola già nota di `social.md` vale anche qui: il passo resta montato e
nascosto quando si va avanti, perché rimontarlo perderebbe ciò che l'utente ha
scritto.

**Età.** `birth_year` resta dov'è, con due aggiunte:

- in `onboarding/actions.ts`, rifiuto se l'età risultante è sotto i **14 anni** —
  la soglia italiana dell'art. 2-quinquies del Codice Privacy, non i 16 del GDPR,
  che è il default derogabile
- accanto al campo, la ragione per cui viene chiesto: inclina i decenni del
  profilo di gusto (`src/lib/taste/profile.ts`). Un dato raccolto senza dire
  perché è un dato raccolto in violazione dell'art. 5(1)(a)

**Personalizzazione spenta di default.**
`alter table user_preferences alter column personalization_enabled set default false`.

Per i **16 utenti esistenti** il valore corrente **non si tocca**. Spegnerlo
d'ufficio degraderebbe la loro home senza che abbiano chiesto niente; tenerlo
acceso significherebbe conservare un consenso mai dato. Quindi: al primo accesso
vedono il foglio e scelgono, e finché non scelgono resta com'è. La scelta scrive
la riga in `user_consents`, che da quel momento è la fonte di verità;
`personalization_enabled` resta come interruttore rapido nel profilo e viene
tenuto allineato.

### § 4 — Cancellazione dell'account

La catena delle chiavi esterne è **già completa**, verificato su `pg_constraint`
il 2026-09-12: `auth.users` → `profiles` con `on delete cascade`, e da `profiles`
altre 26 tabelle in cascata, più 8 che pendono direttamente da `auth.users`
(`user_events`, `user_taste`, `user_preferences`, `user_seed_picks`,
`title_lists`, `title_list_items`, `title_list_members`, `recommendation_links`).

Quindi un `auth.admin.deleteUser(uid)` svuota da solo tutto Postgres. Restano
fuori tre cose, e sono le tre che il codice deve fare a mano:

1. gli oggetti del bucket `tickets` sotto `{uid}/`
2. le righe `devices` di cui l'utente era l'unico membro (`devices.id` non ha FK
   verso l'utente: cancellando `device_members` il dispositivo resta orfano)
3. le sessioni di scrobble legate a quei dispositivi

`src/lib/account/actions.ts` → `deleteAccount(formData)`:

1. `getUser()` — non `getViewer()`: è una scrittura, e la regola di
   `auth-routing.md` riserva `getViewer()` ai percorsi di lettura
2. conferma: l'utente digita il proprio username, confrontato server-side. Non un
   "sei sicuro?", che si clicca per riflesso
3. rate limit stretto, condiviso
4. pulizia bucket, dispositivi orfani, sessioni
5. `auth.admin.deleteUser(uid)` con il service client
6. `signOut()` e redirect a una pagina di addio pubblica

**Deroga motivata all'uso del service client.** La regola del progetto è "service
client mai per dati utente". Qui è l'unica API che cancella la riga `auth.users`,
e senza quella l'account resterebbe in piedi. La deroga è accettabile perché:
l'`uid` viene dalla sessione verificata lato server e non è mai un parametro del
client; l'operazione tocca solo quell'utente; è l'ultima istruzione, dopo i
controlli. Va scritta come commento nel codice, altrimenti al prossimo audit
sembra una svista.

*Alternativa scartata:* una RPC `security definer` `delete_own_account()` senza
argomenti, revocata da `anon`/`authenticated`/`public`, sullo schema di
`scrobble_apply`. Eviterebbe l'eccezione alla regola, ma cancellerebbe da
`auth.users` con SQL grezzo: l'API admin è il percorso documentato da Supabase e
resta corretta se un aggiornamento cambia lo stato interno dell'auth. **Si usa
l'API admin.** Se in futuro si passa alla RPC, va ricordata la lezione di `0036`:
dopo aver applicato una migration che definisce una funzione, **chiamarla** prima
di dichiararla fatta — lì un `min(uuid)` inesistente ha tenuto ferma tutta una
funzionalità pur avendo `apply_migration` risposto `success`.

### § 5 — Export dei dati

Route handler `GET /api/account/export`, non una Server Action: deve restituire un
file, e una Server Action non sa impostare `Content-Disposition`.

- client a cookie, RLS attiva: per costruzione esce solo ciò che l'utente può
  vedere di sé
- una query per gruppo dell'inventario del § 1, in `Promise.all`
- JSON indentato, `Content-Disposition: attachment; filename="zapp-<username>-<data>.json"`
- rate limit **1 all'ora, condiviso via Upstash**: è una lettura pesante, e la
  regola di `scale.md` dice condiviso dove sbagliare costa banda vera
- l'export elenca anche i **file** del bucket `tickets` con un URL firmato a
  scadenza, invece di incorporarli: sono PDF da megabyte

In `/profile`, il bottone sta **sopra** quello di cancellazione, e la schermata di
cancellazione lo ripropone: chi sta per cancellare è esattamente chi dovrebbe
scaricare prima.

### § 6 — DSA (Reg. UE 2022/2065)

Zapp ospita contenuti di terzi — recensioni, commenti, risposte della domanda del
giorno, liste condivise — quindi è un servizio di hosting ai sensi dell'art. 3(g).
Tre obblighi, nessuno dei quali è oggi soddisfatto.

1. **Termini che dicano cosa è vietato e come si modera** (art. 14): in `/termini`.
2. **Meccanismo di segnalazione con esito comunicato** (art. 16). Oggi
   `report_count >= 3` nasconde il contenuto e non lo dice a nessuno. Serve:
   notifica all'autore con il motivo, notifica al segnalante dell'esito, e un modo
   per contestare.
3. **Punto di contatto** pubblico (art. 11-12): l'email in `/termini`.

Zapp è **micro-impresa** ai sensi dell'art. 19, quindi è esente dagli obblighi più
pesanti (relazioni di trasparenza, sistema interno di reclamo strutturato).
L'esenzione va annotata nel registro, non data per scontata.

### § 7 — Carte interne

Non sono pagine dell'app: sono documenti in `docs/legal/`, da tenere aggiornati.

- **`registro-trattamenti.md`** — art. 30. L'esenzione sotto i 250 dipendenti
  **non si applica**: vale solo per trattamenti occasionali, e Zapp tratta in modo
  continuativo e sistematico. Una riga per finalità con base giuridica, categorie,
  destinatari, conservazione, misure di sicurezza.
- **`valutazione-dpia.md`** — art. 35. Con 16 utenti non c'è "monitoraggio
  sistematico su larga scala", quindi la DPIA completa non è dovuta. Ma la
  valutazione della soglia **va scritta**, con la motivazione e un innesco esplicito
  che la fa rifare: superati i 1.000 utenti, oppure all'aggiunta di una categoria
  di dati o di una piattaforma a ZConnection.
- **`data-breach.md`** — procedura art. 33: chi se ne accorge, come si valuta il
  rischio, notifica al Garante entro 72 ore, comunicazione agli interessati,
  registro degli incidenti.
- **`moderazione.md`** — la procedura interna DSA del § 6.
- **`fornitori.md`** — elenco dei responsabili, data di accettazione del DPA, sede,
  garanzia per i trasferimenti extra-UE.

## 5. Superfici UI toccate

| Dove | Cosa cambia |
| --- | --- |
| `(auth)/login`, `(auth)/signup` | riga informativa con i due link |
| `onboarding` | passo 0 di accettazione; blocco età sotto i 14; motivo accanto all'anno di nascita |
| `(app)/layout.tsx` | lettura consensi nel `Promise.all` esistente; foglio bloccante se mancano gli obbligatori |
| `(app)/profile` | riga "Privacy e dati": interruttori consensi, esporta, elimina account; link ai tre documenti nel footer |
| `(legal)/privacy`, `/termini`, `/licenze` | nuove |
| `notifications` | due tipi nuovi: contenuto nascosto, esito segnalazione |

Nessuna modifica alla navigazione: i tre documenti non sono voci di nav, si
raggiungono dal footer del profilo e dai fogli di auth.

## 6. Verifica

- `pnpm test` — `versions.ts` è puro: i test coprono `consensiMancanti` sui casi
  che contano (riga assente, versione vecchia, revocata, revocata e poi riconcessa)
- `pnpm typecheck && pnpm lint && pnpm build`
- `node scripts/security-check.mjs` contro un'istanza avviata: le tre rotte nuove
  devono rispondere **200 da sloggati** (sono in `PUBLIC_PATHS`) e non devono
  generare violazioni CSP
- `get_advisors` di Supabase dopo la migration
- uno script nuovo, `scripts/legal-check.mjs`, con le stesse due trappole di
  `nav-check.mjs` (service worker bloccato, domanda del giorno segnata come vista):
  crea un utente finto, verifica che senza consenso l'app sia bloccata, che
  l'export risponda con un JSON non vuoto, che dopo la cancellazione **nessuna**
  delle 33 tabelle contenga più righe di quell'utente, e lo cancella
- la cancellazione va provata **con un utente finto che ha dati in ogni gruppo**:
  libreria, amicizia, recensione, dispositivo, biglietto nel bucket. È l'unico modo
  di accorgersi di una tabella dimenticata

## 7. Rischi residui, accettati consapevolmente

- **Il cookie di sessione non è `httpOnly`**: lo legge `createBrowserClient` di
  `@supabase/ssr`, è la sua architettura. Difesa: CSP più assenza di sink HTML.
  Già documentato in `security.md`, va ripetuto nel registro come misura.
- **`script-src` tiene `'unsafe-inline'`** di proposito (rendering statico). Stessa
  cosa: è una misura dichiarata, non una dimenticanza.
- **L'informativa non può promettere la cancellazione istantanea dai backup**: i
  backup di Supabase hanno la loro rotazione. Si dichiara il tempo reale.
- **`activities` scritte da trigger**: cancellando un utente spariscono in cascata,
  ma le attività *su* di lui viste da altri (un like ricevuto) spariscono anch'esse.
  È corretto e va detto.

## Appendice A — sottoprogetti 2 e 3 (spec separate)

### 2. ZConnection conforme allo store

Il funzionamento **non cambia**. Si aggiunge:

- schermata di consenso in `/devices/connect` che elenca cosa legge (titolo,
  stagione ed episodio, posizione nel video, piattaforma) e soprattutto **cosa non
  legge** (nessun fotogramma, nessun audio, nessuna credenziale, nessuna altra
  scheda); checkbox non pre-spuntata; scrive `kind = 'scrobble'`
- revoca vera: revocare un dispositivo da `/devices` cancella anche le sue
  `watch_sessions` e `pending_scrobbles`, che oggi restano
- `scripts/build-extension.mjs`: produce la cartella di pubblicazione da
  `extension/`, togliendo il campo `key` e `http://localhost:3000/*` da
  `host_permissions` e `externally_connectable`. Un sorgente solo — le versioni
  scritte a mano si erano già disallineate fra loro
- conseguenza da gestire: pubblicando, Chrome assegna un id nuovo, quindi
  `ZCONNECTION_EXTENSION_ORIGIN` va riscritto dopo la prima pubblicazione
- scheda store onesta, privacy policy che punta a `/privacy`, dichiarazione
  Limited Use

Vincolo da dichiarare, non da nascondere: `host_permissions` **non può** essere
ristretto a `https://www.netflix.com/watch/*`. Netflix è una SPA e il passaggio dal
catalogo al player è un `pushState` senza nuovo documento: la content script deve
essere già caricata. Vale per tutte e quattro le piattaforme.

Precedente rilevante per la review: estensioni di scrobbling verso Trakt
(Universal Trakt Scrobbler e simili) stanno sugli store da anni con lo stesso
meccanismo su Netflix, Prime e Disney+. Non è una scriminante giuridica, è prassi
di enforcement — ma va saputo prima di decidere quanto rischio si corre.

### 3. Attribuzioni e fonti terze

- pagina `/licenze`
- `src/lib/charts/netflix.ts:14`: sostituire lo User-Agent Chrome falso con
  `Zapp/1.0 (+url)`. È l'unico punto del codice dove si aggira deliberatamente un
  controllo d'accesso (il 403 di Tudum). Se rispondono 403 all'UA onesto, la Top 10
  Netflix sparisce e si ripiega su JustWatch: è il prezzo, e va pagato
- chip "YouTube" visibile sul fondale: la ToS delle YouTube API Services vieta di
  nascondere il branding del player, e `REVEAL_DELAY_MS` più il ritaglio fanno
  esattamente quello
- MyMovies: rispettare `robots.txt` nel client, credito con link su ogni pagina
  cinema, e riconsiderare la persistenza del catalogo nazionale in `cinema_venues`
  — l'estrazione sistematica tocca il diritto sui generis sulle banche dati
  (art. 102-bis L. 633/41), che è una pretesa più seria di una violazione di ToS
- attribuzione Open-Meteo (CC-BY-4.0) e "© OpenStreetMap contributors"

## Appendice B — quanto costerebbe diventare commerciali

Richiesto dall'utente. **Numeri approssimativi**, conoscenza ferma a maggio 2026: i
listini cambiano e due fornitori non ne hanno uno pubblico. Da verificare prima di
farci un piano.

| Fornitore | Oggi | Da commerciale | Stima mensile |
| --- | --- | --- | --- |
| Supabase | Free | Pro necessario (backup, supporto, no pausa) | ~25 $ |
| Vercel | Hobby | Pro obbligatorio: la licenza Hobby **vieta** l'uso commerciale | ~20 $ |
| Upstash | Free | pay-as-you-go | ~0-10 $ |
| TMDB | gratuito non commerciale | licenza commerciale su richiesta | **preventivo**, spesso gratuito per volumi piccoli |
| JustWatch | API interna (non autorizzata) | Data API enterprise | **preventivo**, tipicamente a quattro cifre |
| Open-Meteo | free non commerciale | piano a pagamento | ~30 € |
| MDBList | chiave gratuita | piano supporter | ~5-10 $ |
| Nominatim | gratuito, vietato il bulk | istanza propria o geocoder a pagamento | ~0-50 $ |
| YouTube Data API | quota gratuita | invariato, commerciale ammesso | 0 |
| Dominio | vercel.app | dominio proprio | ~1 €/mese |

Ordine di grandezza: **50-90 $/mese** per l'infrastruttura, più due preventivi
ignoti (TMDB e JustWatch) che possono cambiare il quadro. Obblighi aggiuntivi non
monetari: Codice del Consumo, diritto di recesso 14 giorni, fatturazione, P. IVA.
Il salto vero non è il costo, è quello.

## Appendice C — cosa va fatto a mano, fuori dal codice

1. Fornire nome completo confermato ed email di contatto dedicata
2. Accettare i DPA su Supabase, Vercel e Upstash (dashboard) e annotare le date
3. Verificare i listini dell'appendice B prima di decidere sul commerciale
4. Dopo la pubblicazione sullo store: riscrivere `ZCONNECTION_EXTENSION_ORIGIN`

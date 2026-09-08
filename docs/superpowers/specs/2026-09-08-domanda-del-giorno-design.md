# La domanda del giorno

Data: 2026-09-08. Stato: approvato in chat (risposta = un titolo + motivo **facoltativo**;
classifica globale su tutti gli utenti; domande scritte a mano in tabella; popup all'apertura
che si riduce in un'icona accanto alla campanella; podio di ieri prima della domanda di oggi;
risposte firmate con nome e avatar).

## Obiettivo

Ogni giorno l'app fa una domanda su film e serie ("Quale film rivedresti per primo se
perdessi la memoria?"). L'utente risponde **scegliendo un titolo** dal catalogo e, se vuole,
scrivendo un motivo breve. Il giorno dopo, **prima** di vedere la domanda nuova, vede il podio
dei tre titoli più scelti il giorno prima, con i voti e i motivi: è lì che nasce l'ispirazione
e il confronto.

Fuori scope in questa spec: archivio delle domande passate sfogliabile all'indietro, notifica
push del podio, domande solo fra amici, domande generate da un modello.

## 1. Regole del gioco

- **Una risposta per utente per giorno**, modificabile fino alla mezzanotte del suo giorno.
  Dopo, la giornata è chiusa e immutabile.
- Il giorno è sempre **Europe/Rome**, mai UTC: alle 01:00 italiane la domanda dev'essere
  ancora quella della sera prima. In SQL: `(now() at time zone 'Europe/Rome')::date`.
- **Il podio è per titolo**: si contano quante persone hanno scelto quel titolo. Primo,
  secondo e terzo. A parità di voti vince chi è stato scelto per primo in ordine di tempo
  (la prima risposta arrivata su quel titolo): un criterio deterministico, così la classifica
  non balla fra due render.
- Meno di tre titoli distinti → il podio mostra quelli che ci sono (uno o due gradini).
  Nessuna risposta ieri → la schermata del podio salta e si apre direttamente la domanda.
- Il motivo è **facoltativo**, massimo 140 caratteri.
- Ogni risposta è **firmata**: nome e avatar, con link al profilo. È dichiarato nel comporre
  ("La tua risposta sarà visibile a tutti su Zapp") prima di inviare.

## 2. Dati — migration `0022_domanda_del_giorno.sql`

```sql
create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  ask_on date not null unique,                 -- il giorno in cui esce
  text text not null check (char_length(text) between 8 and 200),
  media_scope text not null default 'any'
    check (media_scope in ('movie', 'tv', 'any')),
  created_at timestamptz not null default now()
);

create table public.daily_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.daily_questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title_id bigint not null,
  media_type public.media_type not null,
  reason text check (char_length(reason) <= 140),
  report_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, user_id),
  foreign key (title_id, media_type) references public.titles (id, media_type)
);

create index daily_answers_question_idx on public.daily_answers (question_id, created_at);

create table public.daily_question_views (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ask_on date not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, ask_on)
);
```

Note:

- `daily_answers` ha un `id uuid` proprio (non solo la chiave composta) per poter riusare la
  tabella generica `public.reports`: il suo `check` su `target_type` si allarga a
  `('review', 'comment', 'daily_answer')`. Nessuna tabella di segnalazioni nuova.
- La FK composta su `titles (id, media_type)` è la stessa di `watch_entries`: la riga del
  titolo dev'essere in cache **prima** di scrivere la risposta (vedi §4).
- `daily_question_views` esiste perché **`localStorage` non si usa per i dati dell'utente**
  (regola del progetto). È anche il motivo per cui il popup non ricompare su un altro
  dispositivo dello stesso utente.

### RLS

Tutto `to authenticated`, nessun grant ad `anon` (regola del progetto: la chiave anon sta nel
bundle del browser).

```sql
-- domande: si leggono solo quelle già uscite, altrimenti si sfogliano in anticipo
create policy "daily_questions_select_past" on public.daily_questions
  for select to authenticated
  using (ask_on <= (now() at time zone 'Europe/Rome')::date);

-- risposte: visibili a chi ha fatto accesso, tranne i motivi segnalati e i bloccati
create policy "daily_answers_select" on public.daily_answers
  for select to authenticated
  using (report_count < 3 and not public.is_blocked(auth.uid(), user_id));

-- si scrive solo la propria riga, e solo sulla domanda di oggi
create policy "daily_answers_insert_own" on public.daily_answers
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.daily_questions q
      where q.id = question_id
        and q.ask_on = (now() at time zone 'Europe/Rome')::date
    )
  );

-- `public.is_today_question(question_id)`: stable, la stessa `exists` di sopra,
-- scritta una volta e riusata da update e delete
create policy "daily_answers_update_own" on public.daily_answers
  for update to authenticated
  using (user_id = auth.uid() and public.is_today_question(question_id))
  with check (user_id = auth.uid() and public.is_today_question(question_id));

create policy "daily_answers_delete_own" on public.daily_answers
  for delete to authenticated
  using (user_id = auth.uid() and public.is_today_question(question_id));
```

Il `with check` ripete la condizione di proprietà **e** il vincolo sul giorno: senza, chi ha
una sessione riscrive col PostgREST la propria risposta di ieri e cambia una classifica già
pubblicata. `question_id` e `user_id` sono immutabili: **trigger
`daily_answers_immutable_keys`** (stessa lezione di `friendships_parties_immutable`: il
`with check` da solo non vede la riga vecchia, quindi non può accorgersi di uno spostamento
della risposta su un'altra domanda).

Grant per colonna sull'UPDATE: solo `title_id`, `media_type`, `reason`, `updated_at`. Mai
`report_count` (stessa regola di `reviews`).

`daily_question_views`: select/insert solo `user_id = auth.uid()`, con `with check` uguale.

`report_count` è tenuto da un trigger su `reports` — si estende
`sync_review_report_count` in una funzione gemella `sync_daily_answer_report_count`, revocata
da `anon`, `authenticated` e `public` (le funzioni di trigger non revocate diventano
`/rest/v1/rpc/<nome>` e sono SECURITY DEFINER).

### RPC del podio

```sql
create or replace function public.daily_question_podium(day date)
returns table(title_id bigint, media_type public.media_type, votes bigint, first_at timestamptz)
language sql stable security definer set search_path to 'public'
as $$
  select a.title_id, a.media_type, count(*), min(a.created_at)
  from public.daily_answers a
  join public.daily_questions q on q.id = a.question_id
  where q.ask_on = day and day < (now() at time zone 'Europe/Rome')::date
  group by a.title_id, a.media_type
  order by count(*) desc, min(a.created_at) asc
  limit 3;
$$;
revoke all on function public.daily_question_podium(date) from public, anon;
grant execute on function public.daily_question_podium(date) to authenticated;
```

SECURITY DEFINER per lo stesso motivo di `title_rating_histogram`: il conteggio dev'essere su
**tutti** gli utenti, mentre le policy nascondono le risposte dei bloccati. Restituisce solo
conteggi, nessun dato personale. `day < oggi` dentro la funzione: la classifica di oggi non si
può leggere prima della fine della giornata, altrimenti si vota guardando i risultati.

**Un motivo segnalato tre volte sparisce dalla vista ma il suo voto resta nel conteggio.** Se
lo togliessimo, tre account d'accordo farebbero cadere un titolo dal podio.

**L'elenco delle risposte di oggi si legge in ordine di tempo, dalla più recente**, mai per
voti: una classifica parziale visibile durante la giornata farebbe votare guardando i
risultati, che è esattamente quello che il `day < oggi` della RPC impedisce. La graduatoria
esiste solo il giorno dopo, ed è il podio.

## 3. Lettura e scrittura

```
src/lib/daily/queries.ts    server-only
  getTodayQuestion()          -- domanda di ask_on = oggi (React cache())
  getMyAnswer(questionId)     -- la mia risposta, con il titolo in join
  getYesterdayPodium()        -- RPC + titoli, dietro unstable_cache per data
  getDailyAnswers(questionId, cursor)  -- elenco firmato, dal più recente, per il pannello
  hasSeenToday()              -- daily_question_views

src/lib/daily/actions.ts    "use server"
  answerDailyQuestion(titleId, mediaType, reason?)
  markDailyQuestionSeen()
  reportDailyAnswer(answerId)

src/lib/daily/rank.ts       puro, Vitest
  buildPodium(rows, titles)   -- ordina, taglia a 3, gestisce i pareggi e i gradini mancanti
  topReason(answers)          -- il motivo da mostrare sotto il vincitore
  cleanReason(raw)            -- trim, spazi ripetuti, taglio a 140
```

Il podio di ieri, una volta passata la mezzanotte, **non cambia più**: `unstable_cache` con
chiave `daily-podium:<data>` e TTL lungo (30 giorni), come si fa per le palette. La prima
apertura del giorno lo calcola una volta per tutti.

Ordine di scrittura di `answerDailyQuestion`:

1. valida (`isTmdbId`, `isMediaType`, `cleanReason` ≤ 140);
2. rate limit;
3. `getOrFetchTitle(titleId, mediaType)` — riempie `titles`, altrimenti la FK composta
   respinge la riga;
4. upsert su `(question_id, user_id)` con il `question_id` **letto dal server** (mai preso
   dal client: è un argomento che scrive chiunque abbia una sessione);
5. `revalidatePath("/")`.

Il podio non si rivalida: la sua chiave è la data.

## 4. La schermata

Un solo overlay a tutto schermo, montato dal layout `(app)`, non una pagina e non un modale
classico.

**Fondale**: nero, sopra il backdrop `original` (mai `w1280`) del titolo vincitore di ieri con
il ken burns lento già in uso, e i veli radiali della sua palette (`getPosterPalette`, la
stessa della scheda titolo). Con `prefers-reduced-motion` niente zoom né transizioni.

**Schermata 1 — il podio.** Le tre locandine in prospettiva: la prima grande al centro e più
alta, seconda e terza ai lati, più piccole e ruotate (`rotateY`, come la parete di
`CinemaEntry`). I numeri 1 · 2 · 3 in cifre grandi e leggere (`font-light`, `tabular-nums`,
come il countdown di `PlanCard`); sotto ogni locandina il titolo e "n voti"; in fondo il motivo
più votato, firmato con avatar e nome. La domanda di ieri sta in alto, piccola, in
maiuscoletto: senza, il podio non si capisce.

**Schermata 2 — la domanda di oggi.** Testo grande in `font-light`, campo di ricerca
(`/api/search`, filtrato per `media_scope` quando non è `any`), risultati come griglia di
locandine. Scelto il titolo: card di conferma, campo motivo facoltativo col contatore, riga
"la tua risposta sarà visibile a tutti su Zapp", bottone Invia.

Le due schermate stanno su uno scorrimento orizzontale con `scroll-snap`, puntini e frecce —
**lo stesso schema di `ScanMode`**, già collaudato in questo progetto. Chi ha già risposto vede
solo la prima; il primo giorno in assoluto (nessun ieri) si vede solo la seconda.

**Chiusura**: l'overlay si rimpicciolisce verso l'angolo in alto a destra e diventa l'icona,
accanto alla campanella nello slot `right` di `TopNav` (Framer Motion; con reduced-motion una
dissolvenza). L'icona porta un pallino accent finché non hai risposto. Toccandola riapre lo
stesso pannello, con in più la tua risposta (modificabile fino a mezzanotte) e, sotto, le
risposte di oggi dalla più recente, coi motivi e la voce Segnala.

**Quando compare da solo**: alla prima apertura del giorno, cioè quando manca la riga
`daily_question_views` di oggi. La riga si scrive alla chiusura o all'invio, quindi il popup
non torna nella stessa giornata neanche cambiando pagina.

```
src/components/daily/
  DailyQuestionLauncher.tsx   server: legge domanda, mia risposta, visto-oggi, podio; monta il resto
  DailyOverlay.tsx            client: le due schermate, snap, chiusura verso l'icona
  DailyPodium.tsx             il podio (usato dall'overlay e dal pannello)
  DailyComposer.tsx           ricerca titolo + motivo + invio
  DailyAnswerList.tsx         le risposte di oggi, firmate
  DailyIcon.tsx               l'icona accanto alla campanella (pallino se non hai risposto)
```

Il launcher sta dietro `Suspense` nel layout come `NotificationsBell`: **la home non lo
aspetta**. Le sue letture sono una sola `Promise.all` (regola sulla latenza: mai un await
sequenziale che non serve).

## 5. Sicurezza

Regole non negoziabili del progetto, applicate qui:

- Ogni Server Action è un endpoint HTTP: `title_id`, `media_type` e `reason` arrivano da
  chiunque abbia una sessione. Si validano con `src/lib/validate.ts` (`isTmdbId`,
  `isMediaType`) più `cleanReason`, e il `question_id` non si accetta mai dal client.
- Il vincolo "solo la domanda di oggi" sta **sia** nella RLS **sia** nel codice dell'azione
  (lezione di `cancelPlan`, che si affidava alle sole policy).
- Rate limit dichiarato al punto di chiamata (`src/lib/rate-limit.ts`): risposta 20/ora per
  utente (il gioco ne consente una al giorno, il limite è contro il pestaggio dell'endpoint),
  segnalazione 10/ora.
- Verso il client solo messaggi generici; il dettaglio PostgREST resta nei log.
- Nessun filtro PostgREST costruito concatenando stringhe.
- Le funzioni di trigger nuove vanno revocate da `anon`, `authenticated`, `public`.
- `daily_question_podium` e `daily_answer_counts`: `revoke ... from public, anon`, grant solo
  ad `authenticated`.
- Il testo del motivo non finisce mai in `dangerouslySetInnerHTML` (non ce n'è in tutto il
  progetto, e non se ne aggiungono).

## 6. Le domande

`scripts/seed-daily-questions.ts`: circa 80 domande in italiano, con `ask_on` progressivo dal
giorno dopo l'esecuzione, idempotente (`on conflict (ask_on) do nothing`). Si aggiungono
domande rilanciando lo script o con una riga SQL. `media_scope` per quelle che nominano un
tipo preciso ("Quale serie ti ha tenuto sveglio fino alle tre?" → `tv`).

Esempi del tono: *Il film che rivedresti per primo se perdessi la memoria. La serie che hai
finito in un fine settimana. Il film che ti ha fatto piangere e non lo ammetti. Quello che
tutti odiano e tu difendi. La sigla che non salti mai.*

**Quando le domande finiscono** (nessuna riga con `ask_on = oggi`): niente popup, niente
icona, nessun errore in pagina. Non si ricicla una domanda vecchia in automatico: due podi
diversi sulla stessa domanda confonderebbero l'archivio futuro.

## 7. Verifica

- Vitest su `src/lib/daily/rank.ts` (pareggi, meno di tre titoli, nessuna risposta, motivo
  ripulito) e sulle regole nuove di `validate`.
- `pnpm typecheck && pnpm lint`, e `NEXT_DIST_DIR=.next-check pnpm build` (mai due `next build`
  nella stessa cartella).
- `node scripts/security-check.mjs` contro un'istanza avviata.
- `get_advisors` di Supabase dopo la migration.
- Playwright: overlay a 390px e a 1440px, e il giro completo rispondi → chiudi → riapri
  dall'icona.
- Prova a mano del cambio di giorno: si sposta `ask_on` di una domanda di prova e si verifica
  che il podio di ieri compaia e che la risposta di ieri non sia più modificabile.

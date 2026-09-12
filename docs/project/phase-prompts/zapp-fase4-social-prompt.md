# ZAPP — FASE 4: AMICI, FEED E RECENSIONI

## Contesto
Fasi 1–3 completate e prompt di security/legal applicato (CSP, rate limiting Upstash, cookie consent, RLS verificate). Leggi README, migration esistenti, `components/title/TitleActions`, la home e il profilo prima di iniziare.

Questa fase apre l'app agli altri utenti: amicizie con richiesta e accettazione, feed delle attività degli amici, consigli diretti, recensioni con voto, commenti e spoiler tag. È la prima fase in cui un utente legge dati di un altro: ogni query passa da RLS, nessuna eccezione, nessun uso della service role nelle route utente.

## Schema (migration 0003)
```sql
create type friendship_status as enum ('pending', 'accepted', 'blocked');

friendships (
  id uuid pk,
  requester_id uuid references profiles on delete cascade,
  addressee_id uuid references profiles on delete cascade,
  status friendship_status not null default 'pending',
  created_at, updated_at,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
)
-- funzione sql `are_friends(a uuid, b uuid) returns boolean` (security definer, stable):
-- true se esiste una riga accepted in una delle due direzioni. Usata da tutte le policy.

recommendations (
  id uuid pk,
  from_user uuid, to_user uuid,
  title_id bigint, media_type media_type,
  message text check (char_length(message) <= 280),
  seen_at timestamptz,
  created_at,
  unique (from_user, to_user, title_id, media_type)
)

reviews (
  id uuid pk,
  user_id uuid, title_id bigint, media_type media_type,
  body text not null check (char_length(body) between 1 and 5000),
  has_spoilers boolean default false,
  created_at, updated_at,
  unique (user_id, title_id, media_type)   -- una recensione per titolo
)
-- il voto resta in watch_entries.rating: la recensione lo mostra ma non lo duplica

review_comments (
  id uuid pk,
  review_id uuid references reviews on delete cascade,
  user_id uuid,
  parent_id uuid references review_comments on delete cascade,  -- un solo livello di annidamento
  body text not null check (char_length(body) between 1 and 2000),
  has_spoilers boolean default false,
  created_at, updated_at
)

review_likes (review_id uuid, user_id uuid, created_at, primary key (review_id, user_id))

activities (
  id uuid pk,
  user_id uuid,
  kind text check (kind in ('started','finished','rated','reviewed','wanted','recommended')),
  title_id bigint, media_type media_type,
  payload jsonb,          -- {rating}, {review_id}, {season, episode}, {to_user}
  is_private boolean default false,
  created_at
)
-- popolata da trigger su watch_entries e reviews, non dal codice applicativo.
-- Un trigger, non l'app: così l'import Netflix e ogni futura scrittura generano attività coerenti.
-- Eccezione: l'import Netflix NON deve generare attività (300 righe nel feed degli amici). Usa una
-- variabile di sessione `set local zapp.skip_activities = true` nella Server Action di import.
```

RLS:
- `friendships`: legge chi è coinvolto; inserisce solo come `requester_id = auth.uid()`; aggiorna a `accepted`/`blocked` solo l'`addressee`; elimina chi è coinvolto
- `watch_entries` e `activities`: nuova policy di lettura `are_friends(auth.uid(), user_id) and not is_private`, in aggiunta a quella esistente sul proprio
- `profiles`: chi ha `is_private = true` è leggibile solo dagli amici (username e avatar restano visibili per la ricerca)
- `recommendations`: leggono mittente e destinatario; inserisce solo verso un amico (check con `are_friends`)
- `reviews`, `review_comments`, `review_likes`: lettura pubblica (le recensioni sono il contenuto pubblico dell'app), scrittura solo delle proprie righe
- Bloccati: `are_friends` è false e nessuna delle due parti vede l'altra nei risultati di ricerca

Indici: `activities(user_id, created_at desc)`, `friendships(addressee_id, status)`, `reviews(title_id, media_type, created_at desc)`.

## Amici
- Tab **Amici** torna nella bottom nav (5 tab: Home, Cerca, Libreria, Amici, Profilo; se troppo stretta su 360px, sposta Profilo nell'avatar in alto a destra e motiva la scelta)
- Ricerca utenti per username (ILIKE con prefisso, min 2 caratteri, rate limit 20/min)
- Profilo pubblico `/u/[username]`: avatar, contatori, "Sto guardando" e "Visti di recente" (solo se amici o profilo pubblico), bottone Aggiungi / Richiesta inviata / Accetta / Amici ✓ / menu con Rimuovi e Blocca
- Richieste in arrivo: badge sulla tab, lista con Accetta/Rifiuta
- Consiglia: dal menu "altro" di ogni titolo, "Consiglia a un amico" → sheet con lista amici e messaggio opzionale. Il destinatario lo vede nel feed e in una sezione "Consigliati da amici" in home, sopra "Da vedere", con tap "Voglio vederlo" a un tap

## Feed
Tab Amici, prima sezione: feed cronologico delle `activities` degli amici (non le proprie), paginato per cursore su `created_at`, 20 per pagina, `revalidate = 60`.

Regole di aggregazione lato query (niente feed vuoto o rumoroso):
- Più episodi della stessa serie dello stesso utente nello stesso giorno → una sola riga "Marco ha visto 3 episodi di X, è a S2E7"
- `wanted` non entra nel feed principale (rumore), ma compare nel profilo dell'amico
- `rated` e `finished` sullo stesso titolo entro 10 minuti → una riga "ha finito X e gli ha dato 8"
- Ogni riga: avatar, nome, azione, poster piccolo; tap → scheda titolo. Sulla scheda, se un amico l'ha vista o la sta guardando, mostra "Guardato da Marco, Sara" sotto "Dove guardarlo"

Feed vuoto (nessun amico): stato che spiega e porta alla ricerca utenti, più "Invita" con link `?ref=username` che dopo il signup invia automaticamente la richiesta di amicizia.

## Recensioni (`<TitleReviews />`)
Sostituisce il placeholder nella scheda titolo, sotto la trama.
- Header: voto medio degli utenti Zapp (da `watch_entries.rating`, solo se ≥ 5 voti, altrimenti "Ancora pochi voti") accanto al voto TMDB, mai fuso con esso
- Se l'utente ha `watched` e non ha recensito: card "Scrivi la tua recensione" (textarea, toggle "Contiene spoiler", il voto viene da `watch_entries` e si può modificare qui)
- Lista: prima le recensioni degli amici, poi per like, poi per data. Ogni card: avatar, nome, voto, testo, like, numero commenti. Se `has_spoilers`: testo sfocato con "Mostra spoiler", stato ricordato per sessione. Chi ha il titolo in `watched` vede gli spoiler già aperti
- Commenti: sotto la recensione, un livello di risposta, stesso trattamento spoiler, modifica entro 15 minuti, elimina sempre le proprie
- Segnalazione: bottone "Segnala" che scrive in `reports(target_type, target_id, reporter_id, reason)` (aggiungila alla migration 0003). Nessuna moderazione automatica; 3 segnalazioni distinte nascondono il contenuto in attesa di revisione manuale via SQL. Documenta la query nel README
- Rate limit scritture: 10 recensioni/ora, 30 commenti/ora per utente (Upstash, già configurato)

## Notifiche (minime)
Nessun push. Un'icona campanella in alto con contatore da: richieste ricevute, richieste accettate, consigli ricevuti, commenti alle proprie recensioni. Tabella `notifications(user_id, kind, payload, read_at, created_at)` popolata da trigger. Le push web arrivano in una fase futura.

## Criteri di accettazione
1. A invia richiesta a B; B accetta; entrambi vedono l'altro in Amici e nel feed. B blocca A: A non trova più B nella ricerca e non vede il suo profilo
2. Con due account, verifica via SQL che A non può leggere `watch_entries` di un non-amico né quelle `is_private` di un amico
3. Un import Netflix da 300 righe non genera righe in `activities`
4. 5 "+1" sulla stessa serie nello stesso giorno → una riga nel feed
5. Recensione con spoiler: sfocata per chi non ha visto il titolo, aperta per chi lo ha in `watched`
6. Consiglio inviato → compare in home del destinatario in "Consigliati da amici"; un tap lo mette in "Da vedere"
7. Tab Amici con feed di 200 attività carica in < 1s (verifica il piano della query, niente N+1)
8. `pnpm typecheck` e `pnpm lint` puliti

## Cosa NON fare
- Nessuna chat privata, nessun DM: i consigli hanno un messaggio di 280 caratteri e basta
- Nessuna service role nelle route utente
- Nessun feed algoritmico: cronologico e aggregato, punto
- Nessuna notifica push, nessuna email
- Non modificare le migration 0001 e 0002; solo policy aggiuntive nella 0003

Procedi per step con commit atomici. Scrivi prima la migration e le policy, poi testa RLS con due utenti via SQL, poi la UI. Se una policy ti sembra troppo permissiva, scegli la più restrittiva e segnalalo.

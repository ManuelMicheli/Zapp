# Attori e registi preferiti, con pagina persona

Data: 2026-09-14 · Stato: approvato, da implementare

## Perche'

Oggi il cast della scheda titolo e' un vicolo cieco: cinque nomi in elenco, nessuno
cliccabile. Chi riconosce un interprete non ha modo di chiedersi "cos'altro ha fatto",
e Zapp non sa che quella persona conta per lui. Il profilo di gusto (fase A) deduce le
persone dai titoli visti, ma non accetta una dichiarazione esplicita.

Questa funzione apre due strade: una **pagina persona** raggiungibile dal cast, dalla
riga "Regia" e dalla ricerca; e un elenco di **preferiti** che sta sul profilo, si
confronta con quello degli amici e alimenta i consigli.

## Decisioni prese

| Domanda | Scelta |
| --- | --- |
| Chi si puo' preferire | Attori **e** registi. Non sceneggiatori, compositori, troupe. |
| Cosa mostra la pagina | Testata + filmografia + riga "quanto lo conosci". |
| Come si aggiunge | Cuore nel cast, cuore nella pagina persona, persone fra i risultati di ricerca. |
| Visibilita' | Come libreria e voti: proprio + amici. |
| Peso nell'algoritmo | Si': il preferito diventa una voce forte della dimensione `persone`. |

"Pubblico", in Zapp, vuol dire **visibile agli amici**: `watch_entries` e `activities`
funzionano gia' cosi' (migration 0028). I preferiti seguono la stessa regola, altrimenti
sarebbero l'unico dato personale che sfugge alla privacy del profilo.

## 1. Dati

Migration `supabase/migrations/0044_persone_preferite.sql`.

```sql
create table public.favorite_people (
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    bigint not null,
  name         text   not null,
  role         text   not null check (role in ('Cast','Regia')),
  profile_path text,
  created_at   timestamptz not null default now(),
  primary key (user_id, person_id)
);
```

- `role` usa **le etichette di `title_people`** (migration 0026): `Cast` e `Regia`. Cosi'
  la chiave del preferito, `Cast:Pedro Pascal`, e' letteralmente la chiave che
  `buildRails` e `appartiene()` gia' confrontano. Nessuna conversione, nessun punto in
  cui le due convenzioni possono divergere.
- `name` e `profile_path` sono **copiati** da TMDB al momento del preferito: lo scaffale
  del profilo si disegna con una sola query, senza una chiamata TMDB per cerchio. Il
  nome e' anche la chiave verso l'algoritmo, quindi deve restare stabile anche se TMDB
  cambia la scheda.
- PK `(user_id, person_id)`: preferire due volte la stessa persona e' un no-op. Una
  persona ha quindi **un solo** `role`, anche quando fa entrambe le cose: vale
  `known_for_department` (`Directing` -> `Regia`, tutto il resto -> `Cast`), non il punto
  da cui e' stato toccato il cuore. Altrimenti preferire Eastwood dal cast e poi dalla
  regia darebbe due righe in conflitto sulla stessa chiave primaria.
- Serve anche `create index favorite_people_user_idx on public.favorite_people (user_id,
  created_at desc)` per l'ordine dello scaffale.

RLS, sullo stampo di `watch_entries_select` (0028):

```sql
alter table public.favorite_people enable row level security;

create policy favorite_people_select on public.favorite_people
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select public.my_friend_ids())
  );

create policy favorite_people_insert on public.favorite_people
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy favorite_people_delete on public.favorite_people
  for delete to authenticated
  using (user_id = (select auth.uid()));
```

`(select auth.uid())` e non `auth.uid()`: e' la forma che Postgres valuta una volta per
query invece che per riga (migration 0029).

Tetto di **12 preferiti**, controllato nella Server Action e non da un trigger: il
trigger direbbe "new row violates check constraint", l'azione dice "Hai gia' 12
preferiti: togline uno".

Dopo la migration: rigenerare `src/types/database.ts`.

## 2. TMDB

Una sola chiamata nuova in `src/lib/tmdb/client.ts`:

```ts
/** La scheda di una persona: foto, biografia, reparto principale. */
export async function getPerson(personId: number): Promise<TmdbPersonDetails> {
  return tmdbFetch<TmdbPersonDetails>(`person/${personId}`, { revalidate: 86400 });
}
```

`TmdbPersonDetails` in `src/lib/tmdb/types.ts`: `id`, `name`, `biography`,
`profile_path`, `known_for_department`, `birthday`, `deathday`, `place_of_birth`.

Le filmografie esistono gia': `getPersonMovieCredits` e `getPersonTvCredits`
(client.ts:474 e :483), entrambe con `revalidate: 86400`.

**Nessuna tabella di cache nuova.** Le saghe fanno lo stesso: la cache di `tmdbFetch`
basta, e una tabella `persons` in Postgres sarebbe un secondo posto in cui la stessa
biografia invecchia. Il proxy client (`api/tmdb/[...path]`) resta invariato: la pagina
persona e' un server component, non gli serve.

## 3. Pagina persona

Rotta `src/app/(app)/person/[id]/page.tsx` (piu' `loading.tsx`), dentro il gruppo
`(app)` cosi' eredita provider, `TopNav` e sessione. Una `generateMetadata` col nome, e
`notFound()` se TMDB risponde 404.

### Testata

Foto tonda grande, nome, reparto tradotto (`Acting` -> "Interprete", perche' il campo
TMDB non distingue il genere; `Directing` -> "Regia"), anni di attivita' se
disponibili. Biografia troncata a tre righe con "Leggi tutto" che espande sul posto
(stessa idea di "Vedi tutto il cast": non esiste una pagina della biografia).

Cuore in testata: preferisce/toglie senza uscire dalla pagina.

### Riga "quanto lo conosci"

Una frase sola, dai propri `watch_entries`:

> Hai visto 7 dei suoi 41 titoli - gli dai 8,4 di media

Gli id dei credits li abbiamo gia' in mano dalla filmografia: una `select` su
`watch_entries` con `in (...)` sugli id e il `media_type`, niente join su `titles`.
Se non si e' visto nulla, la riga non compare.

### Filmografia

Pillole **Film / Serie / Tutto**, le stesse della Home.

Griglia di `PosterCard` con ZappScore e stato personale, ordinata per `popularity`
decrescente. Si scartano i credit **senza locandina**: sono quasi sempre comparsate,
documentari mai doppiati, errori del database TMDB.

Se la persona compare sia fra il cast sia in regia (capita spesso: Eastwood, Gerwig),
la pagina ha due sezioni, "Come interprete" e "Come regista", e le pillole filtrano
dentro entrambe.

## 4. Punti d'ingresso

**Cast** (`src/components/title/CastRow.tsx`): ogni riga diventa un `Link` a
`/person/[id]`; a destra della riga un cuore che preferisce senza navigare. Il
componente e' gia' client, quindi il cuore non cambia la natura del file.

**Regia** (`src/components/title/TitleAbout.tsx` via `src/lib/tmdb/facts.ts`): oggi
`regiaDi()` restituisce una stringa di nomi uniti da virgole, buttando via gli id.
Serve `regiaConId(raw, mediaType): { id: number; name: string }[]`, e `TitleAbout`
disegna i nomi come link. `regiaDi()` resta per chi vuole solo la stringa.

**Ricerca** (`src/app/api/search/route.ts`): oggi filtra via tutto cio' che non e'
`movie` o `tv`. Passa anche fino a **4 persone**, solo con
`known_for_department in ('Acting','Directing')` e con `profile_path`, in un campo
`people` separato dai titoli. `SearchClient` le disegna in un gruppo "Persone" sopra i
titoli: chi cerca "Nolan" cerca lui, non il film in cui compare il suo nome.

I provider e i voti non si calcolano per le persone: e' la stessa ragione per cui la
ricerca non fa `getOrFetchTitle` per risultato.

## 5. Profilo

Scaffale «Attori e registi preferiti»: cerchi con foto e nome dentro `HorizontalShelf`,
ognuno linkato a `/person/[id]`.

- `src/app/(app)/profile/page.tsx`: lo scaffale proprio. Se vuoto, non compare; al primo
  preferito appare da solo. Nessuna schermata di gestione: si toglie dal cuore della
  pagina persona.
- `src/app/(app)/u/[username]/page.tsx`: lo scaffale dell'altro. Nessun controllo di
  permessi nel codice della pagina - la `select` torna vuota da sola se non si e' amici,
  esattamente come oggi per statistiche e liste.

Nuovi file: `src/lib/people/queries.ts` (server-only: preferiti di un utente, conteggio
"quanto lo conosci") e `src/lib/people/actions.ts` (`"use server"`: preferisci/togli,
con il tetto di 12 e il rate limit).

## 6. Algoritmo

Il vettore di gusto ha gia' la dimensione `persone` con chiavi `Cast:Nome` / `Regia:Nome`
(`rank/vector.ts`, `rank/rails.ts`). Un preferito e' una **dichiarazione**, quindi vale
il massimo:

```ts
/** Un preferito dichiarato vale quanto la persona piu' amata dedotta dai dati. */
export function applicaPreferiti(v: TasteVector, preferiti: string[]): TasteVector;
```

Pura e testata in `rank.test.ts`, come il resto di quel file. Porta a `1.0` le voci
corrispondenti, senza toccare le altre: un preferito aggiunge, non cancella cio' che i
dati dicono.

Chiamata nei tre punti che caricano il vettore: `rank/engine.ts:92`, `rank/engine.ts:155`,
`moment/shelf.ts:225`. Da li' in poi **non serve altro**:

- `buildRails` produce «Ancora con Pedro Pascal» (rails.ts:45 lo sa gia' fare, e
  `persone` e' la prima dimensione in ordine di specificita');
- `appartiene()` filtra i candidati per nome esatto contro `title_people`;
- l'affinita' mostrata sale di conseguenza.

Il rispetto della personalizzazione disattivata (`user_preferences`) non cambia: se il
vettore non viene caricato, non viene nemmeno applicato il preferito.

## Cosa resta fuori

- Pagina di ricerca dedicata alle persone (la ricerca unica basta).
- Preferiti per sceneggiatori, compositori, troupe.
- Notifiche "e' uscito un nuovo film del tuo preferito".
- Classifica sociale degli attori piu' preferiti fra gli amici.

## Verifica

- `pnpm test` per `applicaPreferiti` e per `regiaConId`.
- `pnpm typecheck && pnpm lint && pnpm build` (il resto non e' coperto da vitest).
- `scripts/security-check.mjs` dopo la migration: la tabella nuova deve risultare con
  RLS attiva e nessuna policy aperta ad `anon`.
- A mano: preferire dalla scheda, vedere il cerchio comparire sul profilo, aprire il
  profilo di chi non e' amico e verificare che lo scaffale non ci sia.

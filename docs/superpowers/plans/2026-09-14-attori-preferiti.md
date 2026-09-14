# Attori e registi preferiti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dare a ogni attore e regista una pagina con la sua filmografia, raggiungibile dal cast, dalla riga "Regia" e dalla ricerca, e lasciare che l'utente ne dichiari fino a 12 come preferiti, visibili sul proprio profilo e su quello degli amici e usati dall'algoritmo dei consigli.

**Architecture:** una tabella `favorite_people` con le stesse regole RLS di `watch_entries`; una rotta server `/(app)/person/[id]` che legge TMDB (`person/{id}` + le due filmografie già esistenti) senza nessuna cache nuova in Postgres; i punti d'ingresso (cast, regia, ricerca, profilo) sono modifiche piccole a file esistenti; l'aggancio all'algoritmo è una sola funzione pura che alza al massimo le voci `persone` già previste dal vettore di gusto.

**Tech Stack:** Next.js App Router (server components), Supabase (Postgres + RLS), TMDB API v3, Tailwind (dark only), Vitest per le sole funzioni pure.

**Spec:** `docs/superpowers/specs/2026-09-14-attori-preferiti-design.md`

**Base:** ramo `feat/attori-preferiti`, nato da `origin/main` (e2215fa). Il numero libero per una migration nuova e' **0054**: fino a 0053 sono occupati.

## Global Constraints

- **Italiano** ovunque: UI, commenti del codice, messaggi d'errore, nomi dei simboli di dominio. Nessuna stringa inglese visibile all'utente.
- **Mai TMDB dal client**: ogni chiamata passa da `src/lib/tmdb/client.ts` (`server-only`). La pagina persona è un server component.
- **Niente librerie UI esterne.** Le primitive stanno in `src/components/ui/`.
- **Niente `localStorage`** per dati utente.
- I moduli server iniziano con `import "server-only";`. `actions.ts` = Server Actions (`"use server"`), `queries.ts` = letture server-only.
- Nelle policy RLS si scrive `(select auth.uid())`, **mai** `auth.uid()` nudo: la seconda forma viene valutata riga per riga (migration 0029).
- Il service-role client non si usa mai per dati utente.
- Vitest copre **solo** funzioni pure (`src/**/*.test.ts`). Tutto il resto si verifica con `pnpm typecheck && pnpm lint && pnpm build`.
- Ogni commit finisce con queste due righe:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XCkgULKB2c2U7b9bae3BRH
```

- Non eseguire `git add -A` né `git add -f`: l'albero di lavoro è condiviso con altre sessioni. Aggiungere **solo** i file elencati nel task.
- Il tetto è **12 preferiti**. Il ruolo di una persona è **uno solo**, dedotto da `known_for_department` (`Directing` → `Regia`, tutto il resto → `Cast`).

## File Structure

**Creati**

| File | Responsabilità |
| --- | --- |
| `supabase/migrations/0054_persone_preferite.sql` | tabella `favorite_people`, indice, policy |
| `src/lib/people/filmography.ts` | pura: da due risposte TMDB alla filmografia ordinata e ripulita |
| `src/lib/people/filmography.test.ts` | test della sopra |
| `src/lib/people/queries.ts` | letture server-only: preferiti di un utente, "quanto lo conosci" |
| `src/lib/people/actions.ts` | Server Action: preferisci/togli, con tetto e rate limit |
| `src/app/(app)/person/[id]/page.tsx` | la pagina persona |
| `src/app/(app)/person/[id]/loading.tsx` | scheletro |
| `src/components/people/PersonHeader.tsx` | testata: foto, nome, reparto, biografia |
| `src/components/people/FavoritePersonButton.tsx` | client: il cuore, toggle ottimistico |
| `src/components/people/PersonFilmography.tsx` | client: pillole Film/Serie/Tutto + griglia |
| `src/components/people/FavoritePeopleShelf.tsx` | scaffale di cerchi per i due profili |
| `src/lib/tmdb/facts.test.ts` | test di `regiaConId` |

**Modificati**

| File | Modifica |
| --- | --- |
| `src/lib/tmdb/types.ts` | `TmdbPersonDetails` |
| `src/lib/tmdb/client.ts` | `getPerson()` |
| `src/lib/tmdb/facts.ts` | `regiaConId()`; `regiaDi()` ne diventa un involucro; `TitleFact.persone` |
| `src/lib/tmdb/mappers.ts` | `SearchPerson` |
| `src/lib/rank/vector.ts` | `applicaPreferiti()` |
| `src/lib/rank/rank.test.ts` | test della sopra |
| `src/lib/rank/engine.ts` | applica i preferiti nei due punti che caricano il vettore |
| `src/lib/moment/shelf.ts` | idem |
| `src/lib/taste/surfaces.ts` | superficie `person` |
| `src/components/title/CastRow.tsx` | riga cliccabile + cuore dell'attore; via il gesto di voto del personaggio |
| `src/components/title/CastSection.tsx` | legge anche i preferiti del viewer |
| `src/components/title/TitleAbout.tsx` | "Regia" cliccabile |
| `src/lib/search/instant.ts` | `instantPeople()` accanto a `instantSearch()` |
| `src/app/api/search/route.ts` | restituisce anche le persone |
| `src/app/(app)/search/SearchClient.tsx` | gruppo "Persone" |
| `src/app/(app)/profile/page.tsx` | scaffale preferiti |
| `src/app/(app)/u/[username]/page.tsx` | scaffale preferiti dell'altro |
| `src/types/database.ts` | rigenerato |
| `CLAUDE.md` | una riga in tabella |
| `docs/architecture/people.md` | nuova pagina (creata nel Task 11) |

---

### Task 1: Tabella `favorite_people`

**Files:**
- Create: `supabase/migrations/0054_persone_preferite.sql`
- Modify: `src/types/database.ts` (rigenerato, non scritto a mano)

**Interfaces:**
- Consumes: `public.my_friend_ids()` (migration 0028).
- Produces: tabella `favorite_people(user_id, person_id, name, role, profile_path, created_at)`; in `src/types/database.ts` compare `Tables<"favorite_people">`.

- [ ] **Step 1: Scrivere la migration**

```sql
-- Attori e registi che l'utente ha dichiarato preferiti.
--
-- `role` usa le stesse due etichette di `title_people` (migration 0026), `Cast` e
-- `Regia`: cosi' la chiave del preferito -- `Cast:Pedro Pascal` -- e' *letteralmente*
-- la chiave che `buildRails` e `appartiene()` confrontano gia' oggi. Due convenzioni
-- diverse per la stessa cosa divergono alla prima modifica.
--
-- `name` e `profile_path` sono copiati da TMDB al momento del preferito: lo scaffale
-- del profilo si disegna con una query sola, senza una chiamata TMDB per cerchio.
--
-- Una persona ha **un solo** ruolo, anche se dirige e recita: la chiave primaria e'
-- (user_id, person_id), e due righe con ruoli diversi non potrebbero coesistere.

create table if not exists public.favorite_people (
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    bigint not null,
  name         text   not null,
  role         text   not null check (role in ('Cast','Regia')),
  profile_path text,
  created_at   timestamptz not null default now(),
  primary key (user_id, person_id)
);

-- L'ordine dello scaffale e' "l'ultimo preferito per primo": la PK non basta.
create index if not exists favorite_people_user_idx
  on public.favorite_people (user_id, created_at desc);

alter table public.favorite_people enable row level security;

-- Stessa visibilita' di watch_entries (migration 0028): propri, piu' quelli degli
-- amici. `(select auth.uid())` e non `auth.uid()`: la seconda forma Postgres la
-- valuta riga per riga (migration 0029).
drop policy if exists favorite_people_select on public.favorite_people;
create policy favorite_people_select on public.favorite_people
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or user_id in (select public.my_friend_ids())
  );

drop policy if exists favorite_people_insert on public.favorite_people;
create policy favorite_people_insert on public.favorite_people
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists favorite_people_delete on public.favorite_people;
create policy favorite_people_delete on public.favorite_people
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Nessuna policy di update: un preferito si mette e si toglie, non si modifica.
```

- [ ] **Step 2: Applicare la migration**

Run: `supabase db push`
Expected: la migration `0054_persone_preferite` risulta applicata, nessun errore.

- [ ] **Step 3: Rigenerare i tipi**

Run: `supabase gen types typescript --project-id bbuhwzdbzxgydewmcdwd > src/types/database.ts`
Expected: `git diff src/types/database.ts` mostra **solo** l'aggiunta di `favorite_people`. Se mostra altro, il database ha migrazioni non nel repo: fermarsi e segnalarlo.

- [ ] **Step 4: Verificare la sicurezza**

Run: `node scripts/security-check.mjs`
Expected: `favorite_people` compare con RLS attiva e nessuna policy concessa ad `anon`.

- [ ] **Step 5: Verificare che il progetto compili**

Run: `pnpm typecheck`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0054_persone_preferite.sql src/types/database.ts
git commit -m "feat(persone): tabella favorite_people con RLS come watch_entries"
```

---

### Task 2: TMDB — scheda persona e regia con id

**Files:**
- Modify: `src/lib/tmdb/types.ts` (in coda alle interfacce persona, dopo `TmdbPersonTvCredits`, riga ~183)
- Modify: `src/lib/tmdb/client.ts` (accanto a `getPersonMovieCredits`, riga ~474)
- Modify: `src/lib/tmdb/facts.ts` (`regiaDi`, riga ~69; `TitleFact`, riga 6; `fattiTrama`, riga ~99)
- Create: `src/lib/tmdb/facts.test.ts`

**Interfaces:**
- Consumes: `tmdbFetch` (privata a `client.ts`), `TitleRaw` (`facts.ts`).
- Produces:
  - `interface TmdbPersonDetails { id, name, biography, profile_path, known_for_department, birthday, deathday, place_of_birth }`
  - `getPerson(personId: number): Promise<TmdbPersonDetails>`
  - `interface Persona { id: number; name: string }`
  - `regiaConId(raw: TitleRaw, mediaType: "movie" | "tv"): Persona[]`
  - `TitleFact` guadagna `persone?: Persona[]`

- [ ] **Step 1: Scrivere il test che fallisce**

Create `src/lib/tmdb/facts.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { regiaConId, regiaDi, type TitleRaw } from "./facts";

/** Un `titles.raw` finto con la sola troupe che serve al test. */
function raw(crew: { id: number; name: string; job: string }[]): TitleRaw {
  return { credits: { cast: [], crew } } as unknown as TitleRaw;
}

describe("regiaConId", () => {
  it("prende solo chi ha job Director, con l'id per il link", () => {
    const r = raw([
      { id: 1, name: "Denis Villeneuve", job: "Director" },
      { id: 2, name: "Greig Fraser", job: "Director of Photography" },
    ]);
    expect(regiaConId(r, "movie")).toEqual([{ id: 1, name: "Denis Villeneuve" }]);
  });

  it("non ripete la stessa persona accreditata due volte", () => {
    const r = raw([
      { id: 7, name: "Joel Coen", job: "Director" },
      { id: 7, name: "Joel Coen", job: "Director" },
      { id: 8, name: "Ethan Coen", job: "Director" },
    ]);
    expect(regiaConId(r, "movie")).toEqual([
      { id: 7, name: "Joel Coen" },
      { id: 8, name: "Ethan Coen" },
    ]);
  });

  it("si ferma a tre nomi: una riga della scheda, non un elenco", () => {
    const r = raw(
      [10, 11, 12, 13].map((id) => ({ id, name: `Regista ${id}`, job: "Director" })),
    );
    expect(regiaConId(r, "movie")).toHaveLength(3);
  });

  it("per le serie usa created_by", () => {
    const serie = {
      created_by: [{ id: 99, name: "Vince Gilligan" }],
    } as unknown as TitleRaw;
    expect(regiaConId(serie, "tv")).toEqual([{ id: 99, name: "Vince Gilligan" }]);
  });

  it("senza troupe non inventa nulla", () => {
    expect(regiaConId(undefined, "movie")).toEqual([]);
    expect(regiaConId(raw([]), "movie")).toEqual([]);
  });
});

describe("regiaDi", () => {
  it("resta la stringa di prima, costruita sugli stessi nomi", () => {
    const r = raw([
      { id: 7, name: "Joel Coen", job: "Director" },
      { id: 8, name: "Ethan Coen", job: "Director" },
    ]);
    expect(regiaDi(r, "movie")).toBe("Joel Coen, Ethan Coen");
    expect(regiaDi(raw([]), "movie")).toBeNull();
  });
});
```

- [ ] **Step 2: Lanciare il test e vederlo fallire**

Run: `pnpm test -- src/lib/tmdb/facts.test.ts`
Expected: FAIL, `regiaConId is not a function` (non esiste ancora).

- [ ] **Step 3: Scrivere `regiaConId` e riscrivere `regiaDi`**

In `src/lib/tmdb/facts.ts`, **sostituire** la `regiaDi` esistente con:

```ts
/** Una persona nominata in una scheda, con l'id per aprire la sua pagina. */
export interface Persona {
  id: number;
  name: string;
}

/**
 * Chi ha diretto il film (o creato la serie), **con l'id TMDB**: serve per il link
 * alla pagina persona. `regiaDi` restituiva solo una stringa di nomi, e l'id andava
 * perso proprio dove serve renderlo cliccabile.
 */
export function regiaConId(raw: TitleRaw, mediaType: "movie" | "tv"): Persona[] {
  const grezzi: { id?: number; name?: string }[] =
    mediaType === "tv"
      ? (raw?.created_by ?? [])
      : (raw?.credits?.crew ?? []).filter((c) => c.job === "Director");

  const visti = new Set<number>();
  const out: Persona[] = [];
  for (const p of grezzi) {
    // TMDB accredita lo stesso regista due volte piu' spesso di quanto si creda
    if (!p?.id || !p.name || visti.has(p.id)) continue;
    visti.add(p.id);
    out.push({ id: p.id, name: p.name });
    if (out.length === 3) break;
  }
  return out;
}

export function regiaDi(raw: TitleRaw, mediaType: "movie" | "tv"): string | null {
  const persone = regiaConId(raw, mediaType);
  return persone.length > 0 ? persone.map((p) => p.name).join(", ") : null;
}
```

- [ ] **Step 4: Lanciare il test e vederlo passare**

Run: `pnpm test -- src/lib/tmdb/facts.test.ts`
Expected: PASS, 6 test.

- [ ] **Step 5: Portare gli id fino alla riga "Regia"**

In `src/lib/tmdb/facts.ts`, riga 6, estendere il tipo:

```ts
export interface TitleFact {
  label: string;
  value: string;
  /**
   * Quando il valore e' fatto di persone, i loro id: chi disegna il fatto puo'
   * renderle cliccabili. `value` resta la stringa pronta, per chi non vuole link.
   */
  persone?: Persona[];
}
```

e dentro `fattiTrama` **sostituire** le due righe della regia con:

```ts
  const registi = regiaConId(raw, mediaType);
  if (registi.length > 0)
    fatti.push({
      label: mediaType === "tv" ? "Creata da" : "Regia",
      value: registi.map((p) => p.name).join(", "),
      persone: registi,
    });
```

- [ ] **Step 6: Aggiungere il tipo della scheda persona**

In `src/lib/tmdb/types.ts`, subito dopo `TmdbPersonTvCredits` (riga ~183):

```ts
/** La scheda di una persona (`/person/{id}`). */
export interface TmdbPersonDetails {
  id: number;
  name: string;
  biography: string | null;
  profile_path: string | null;
  /** `Acting`, `Directing`, `Writing`... TMDB non dice il genere della persona. */
  known_for_department: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
}
```

- [ ] **Step 7: Aggiungere `getPerson`**

In `src/lib/tmdb/client.ts`, subito **prima** di `getPersonMovieCredits` (riga ~474), e aggiungere `TmdbPersonDetails` all'import dei tipi in testa al file:

```ts
/**
 * La scheda di una persona. Stessa vita di cache delle sue filmografie (un giorno):
 * una biografia non cambia piu' spesso di cosi', e una tabella `persons` in Postgres
 * sarebbe un secondo posto in cui la stessa biografia invecchia.
 */
export async function getPerson(personId: number): Promise<TmdbPersonDetails> {
  return tmdbFetch<TmdbPersonDetails>(`person/${personId}`, { revalidate: 86400 });
}
```

- [ ] **Step 8: Verificare tutto**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: test verdi, nessun errore di tipo, nessun avviso di lint.

- [ ] **Step 9: Commit**

```bash
git add src/lib/tmdb/types.ts src/lib/tmdb/client.ts src/lib/tmdb/facts.ts src/lib/tmdb/facts.test.ts
git commit -m "feat(persone): getPerson e regia con id TMDB"
```

---

### Task 3: La filmografia, ripulita e ordinata

**Files:**
- Create: `src/lib/people/filmography.ts`
- Create: `src/lib/people/filmography.test.ts`

**Interfaces:**
- Consumes: `TmdbPersonMovieCredits`, `TmdbPersonTvCredits` da `@/lib/tmdb/types`.
- Produces:
  - `interface CreditoPersona { id: number; mediaType: "movie" | "tv"; title: string; posterPath: string; year: string | null; voteAverage: number | null }`
  - `interface Filmografia { interprete: CreditoPersona[]; regista: CreditoPersona[] }`
  - `filmografia(movies, tv): Filmografia`
  - `const MAX_CREDITI = 60`

Funzione **pura**: nessuna rete, nessun database. È la parte che decide cosa l'utente vede e va provata con dati finti.

- [ ] **Step 1: Scrivere il test che fallisce**

Create `src/lib/people/filmography.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filmografia, MAX_CREDITI } from "./filmography";
import type { TmdbPersonMovieCredits, TmdbPersonTvCredits } from "@/lib/tmdb/types";

function film(patch: Record<string, unknown>) {
  return {
    id: 1,
    media_type: "movie",
    title: "Un film",
    poster_path: "/p.jpg",
    release_date: "2020-05-01",
    vote_average: 7,
    popularity: 10,
    ...patch,
  };
}

function serie(patch: Record<string, unknown>) {
  return {
    id: 1,
    media_type: "tv",
    name: "Una serie",
    poster_path: "/s.jpg",
    first_air_date: "2019-01-01",
    vote_average: 8,
    popularity: 5,
    ...patch,
  };
}

const vuoto = { cast: [], crew: [] };

describe("filmografia", () => {
  it("mappa un film del cast con anno e locandina", () => {
    const out = filmografia(
      { cast: [film({ id: 42 })] } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete).toEqual([
      {
        id: 42,
        mediaType: "movie",
        title: "Un film",
        posterPath: "/p.jpg",
        year: "2020",
        voteAverage: 7,
      },
    ]);
    expect(out.regista).toEqual([]);
  });

  it("scarta i crediti senza locandina: sono comparsate ed errori di TMDB", () => {
    const out = filmografia(
      {
        cast: [film({ id: 1, poster_path: null }), film({ id: 2 })],
      } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete.map((c) => c.id)).toEqual([2]);
  });

  it("ordina per popolarita' decrescente, film e serie insieme", () => {
    const out = filmografia(
      {
        cast: [film({ id: 1, popularity: 3 }), film({ id: 2, popularity: 50 })],
      } as unknown as TmdbPersonMovieCredits,
      { cast: [serie({ id: 3, popularity: 20 })] } as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete.map((c) => c.id)).toEqual([2, 3, 1]);
  });

  it("non ripete lo stesso titolo accreditato due volte", () => {
    const out = filmografia(
      {
        cast: [film({ id: 5 }), film({ id: 5 })],
      } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete).toHaveLength(1);
  });

  it("lo stesso id fra un film e una serie sono due titoli diversi", () => {
    const out = filmografia(
      { cast: [film({ id: 9 })] } as unknown as TmdbPersonMovieCredits,
      { cast: [serie({ id: 9 })] } as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete).toHaveLength(2);
  });

  it("in regia va solo chi ha job Director, non tutta la troupe", () => {
    const out = filmografia(
      {
        crew: [
          film({ id: 1, job: "Director" }),
          film({ id: 2, job: "Executive Producer" }),
        ],
      } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.regista.map((c) => c.id)).toEqual([1]);
  });

  it("taglia a MAX_CREDITI per sezione", () => {
    const molti = Array.from({ length: MAX_CREDITI + 10 }, (_, i) =>
      film({ id: i + 1, popularity: i }),
    );
    const out = filmografia(
      { cast: molti } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete).toHaveLength(MAX_CREDITI);
  });

  it("un voto a zero e' un voto che non c'e'", () => {
    const out = filmografia(
      { cast: [film({ vote_average: 0 })] } as unknown as TmdbPersonMovieCredits,
      vuoto as unknown as TmdbPersonTvCredits,
    );
    expect(out.interprete[0].voteAverage).toBeNull();
  });

  it("regge risposte assenti", () => {
    expect(filmografia(null, null)).toEqual({ interprete: [], regista: [] });
  });
});
```

- [ ] **Step 2: Lanciare il test e vederlo fallire**

Run: `pnpm test -- src/lib/people/filmography.test.ts`
Expected: FAIL, il modulo `./filmography` non esiste.

- [ ] **Step 3: Scrivere l'implementazione minima**

Create `src/lib/people/filmography.ts`:

```ts
import type { TmdbPersonMovieCredits, TmdbPersonTvCredits } from "@/lib/tmdb/types";

/**
 * Da due risposte TMDB alla filmografia che la pagina mostra.
 *
 * Funzione **pura**: qui stanno le sole scelte discutibili — cosa si butta via e in
 * che ordine si mette il resto — e si provano con dati finti invece che aprendo la
 * pagina di Tom Hanks e contando le locandine.
 */

/** Oltre questi, la pagina e' un elenco telefonico e nessuno scorre fino in fondo. */
export const MAX_CREDITI = 60;

export interface CreditoPersona {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  /** Mai `null`: i crediti senza locandina non entrano nemmeno. */
  posterPath: string;
  year: string | null;
  voteAverage: number | null;
}

export interface Filmografia {
  interprete: CreditoPersona[];
  regista: CreditoPersona[];
}

/** Quello che serve qui di un risultato TMDB, film o serie che sia. */
interface CreditoGrezzo {
  id?: number;
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  popularity?: number;
  job?: string;
}

function mappa(
  grezzo: CreditoGrezzo,
  mediaType: "movie" | "tv",
): (CreditoPersona & { popularity: number }) | null {
  const titolo = (mediaType === "movie" ? grezzo.title : grezzo.name)?.trim();
  const poster = grezzo.poster_path;
  if (!grezzo.id || !titolo || !poster) return null;
  const data = mediaType === "movie" ? grezzo.release_date : grezzo.first_air_date;
  const voto = grezzo.vote_average;
  return {
    id: grezzo.id,
    mediaType,
    title: titolo,
    posterPath: poster,
    year: data && data.length >= 4 ? data.slice(0, 4) : null,
    // TMDB scrive 0 sui titoli che nessuno ha votato, e "0" si legge come stroncatura
    voteAverage: voto && voto > 0 ? voto : null,
    popularity: grezzo.popularity ?? 0,
  };
}

function raccogli(
  liste: { crediti: CreditoGrezzo[]; mediaType: "movie" | "tv" }[],
): CreditoPersona[] {
  const visti = new Set<string>();
  const out: (CreditoPersona & { popularity: number })[] = [];
  for (const { crediti, mediaType } of liste) {
    for (const grezzo of crediti) {
      const c = mappa(grezzo, mediaType);
      if (!c) continue;
      // stesso id su un film e su una serie sono due titoli diversi
      const chiave = `${c.mediaType}-${c.id}`;
      if (visti.has(chiave)) continue;
      visti.add(chiave);
      out.push(c);
    }
  }
  out.sort((a, b) => b.popularity - a.popularity);
  return out.slice(0, MAX_CREDITI).map(({ popularity: _p, ...resto }) => resto);
}

export function filmografia(
  movies: TmdbPersonMovieCredits | null | undefined,
  tv: TmdbPersonTvCredits | null | undefined,
): Filmografia {
  const soloRegia = (crediti: CreditoGrezzo[]) =>
    crediti.filter((c) => c.job === "Director");

  return {
    interprete: raccogli([
      { crediti: (movies?.cast ?? []) as CreditoGrezzo[], mediaType: "movie" },
      { crediti: (tv?.cast ?? []) as CreditoGrezzo[], mediaType: "tv" },
    ]),
    regista: raccogli([
      { crediti: soloRegia((movies?.crew ?? []) as CreditoGrezzo[]), mediaType: "movie" },
      { crediti: soloRegia((tv?.crew ?? []) as CreditoGrezzo[]), mediaType: "tv" },
    ]),
  };
}
```

- [ ] **Step 4: Lanciare il test e vederlo passare**

Run: `pnpm test -- src/lib/people/filmography.test.ts`
Expected: PASS, 9 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/people/filmography.ts src/lib/people/filmography.test.ts
git commit -m "feat(persone): filmografia pura, ordinata per popolarita'"
```

---

### Task 4: Il preferito nel vettore di gusto

**Files:**
- Modify: `src/lib/rank/vector.ts` (in coda al file)
- Modify: `src/lib/rank/rank.test.ts` (nuovo `describe`, dopo quello di `toTasteVector`)

**Interfaces:**
- Consumes: `TasteVector` da `./vector`.
- Produces: `applicaPreferiti(v: TasteVector, preferiti: string[]): TasteVector` — `preferiti` sono chiavi già pronte nella forma `Cast:Nome` / `Regia:Nome`.

- [ ] **Step 1: Scrivere il test che fallisce**

In `src/lib/rank/rank.test.ts`, aggiungere l'import (in testa, insieme agli altri da `./vector`) e in coda al file:

```ts
describe("applicaPreferiti", () => {
  it("porta al massimo una persona che i dati non conoscevano", () => {
    const v = applicaPreferiti(toTasteVector(riga({ generi: { "28": 1 } })), [
      "Cast:Pedro Pascal",
    ]);
    expect(v.persone.get("Cast:Pedro Pascal")).toBe(1);
  });

  it("non abbassa chi era gia' in cima", () => {
    const v = applicaPreferiti(
      toTasteVector(riga({ persone: { "Regia:Nolan": 1, "Cast:Bale": 0.4 } })),
      ["Regia:Nolan"],
    );
    expect(v.persone.get("Regia:Nolan")).toBe(1);
  });

  it("una dichiarazione batte un rifiuto dedotto dai dati", () => {
    const v = applicaPreferiti(toTasteVector(riga({ persone: { "Cast:X": -1 } })), [
      "Cast:X",
    ]);
    expect(v.persone.get("Cast:X")).toBe(1);
  });

  it("non tocca le altre persone ne' le altre dimensioni", () => {
    const base = toTasteVector(riga({ generi: { "28": 1 }, persone: { "Cast:A": 0.5 } }));
    const v = applicaPreferiti(base, ["Cast:B"]);
    expect(v.persone.get("Cast:A")).toBe(0.5);
    expect(v.generi.get("28")).toBe(1);
    expect(v.fiducia).toBe(base.fiducia);
  });

  it("senza preferiti restituisce il vettore com'era", () => {
    const base = toTasteVector(riga({ persone: { "Cast:A": 0.5 } }));
    expect(applicaPreferiti(base, [])).toBe(base);
  });
});
```

- [ ] **Step 2: Lanciare il test e vederlo fallire**

Run: `pnpm test -- src/lib/rank/rank.test.ts`
Expected: FAIL, `applicaPreferiti is not exported` / non definita.

- [ ] **Step 3: Scrivere l'implementazione**

In coda a `src/lib/rank/vector.ts`:

```ts
/**
 * I preferiti dichiarati, dentro il vettore.
 *
 * Un preferito non e' un indizio come gli altri: e' l'utente che lo dice. Vale quindi
 * quanto la persona piu' amata **dedotta** dai dati, cioe' 1 — il massimo della scala,
 * perche' `normalizza` divide per il massimo assoluto. Vince anche su un valore
 * negativo: se i dati dicevano "questo attore no" e l'utente lo mette fra i preferiti,
 * ha ragione l'utente.
 *
 * Aggiunge e basta: le altre persone restano dove sono, perche' un preferito dichiara
 * cosa ami, non cosa hai smesso di amare.
 */
export function applicaPreferiti(v: TasteVector, preferiti: string[]): TasteVector {
  if (preferiti.length === 0) return v;
  const persone = new Map(v.persone);
  for (const chiave of preferiti) {
    if ((persone.get(chiave) ?? 0) < 1) persone.set(chiave, 1);
  }
  return { ...v, persone };
}
```

- [ ] **Step 4: Lanciare i test e vederli passare**

Run: `pnpm test -- src/lib/rank/rank.test.ts`
Expected: PASS, compresi i 5 nuovi.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rank/vector.ts src/lib/rank/rank.test.ts
git commit -m "feat(persone): un preferito dichiarato entra nel vettore di gusto"
```

---

### Task 5: Letture e azione dei preferiti

**Files:**
- Create: `src/lib/people/queries.ts`
- Create: `src/lib/people/actions.ts`

**Interfaces:**
- Consumes: `createClient` (`@/lib/supabase/server`), `getViewer` (`@/lib/auth/viewer`), `rateLimit` (`@/lib/rate-limit`), `isTmdbId` (`@/lib/validate`), `CreditoPersona` (Task 3).
- Produces:
  - `interface PersonaPreferita { personId: number; name: string; role: "Cast" | "Regia"; profilePath: string | null }`
  - `getFavoritePeople(userId: string): Promise<PersonaPreferita[]>`
  - `getFavoriteKeys(): Promise<string[]>` — chiavi `Cast:Nome` del **viewer**, per l'algoritmo
  - `isFavorite(personId: number): Promise<boolean>`
  - `interface Conoscenza { visti: number; totale: number; media: number | null }`
  - `conoscenzaDi(crediti: CreditoPersona[]): Promise<Conoscenza>`
  - `MAX_PREFERITI = 12`
  - `togglePreferito(input): Promise<{ ok: boolean; preferito?: boolean; error?: string }>`

- [ ] **Step 1: Scrivere le letture**

Create `src/lib/people/queries.ts`:

```ts
import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth/viewer";
import type { CreditoPersona } from "./filmography";

/**
 * Letture sui preferiti. Nessun controllo di permessi scritto qui dentro: la policy
 * `favorite_people_select` (migration 0044) lascia passare i propri e quelli degli
 * amici, e per un estraneo la `select` torna vuota da sola. Un `if` in piu' qui
 * sarebbe una seconda regola da tenere allineata alla prima.
 */

export interface PersonaPreferita {
  personId: number;
  name: string;
  role: "Cast" | "Regia";
  profilePath: string | null;
}

/** Tetto dichiarato in un posto solo: lo legge anche l'azione. */
export const MAX_PREFERITI = 12;

export async function getFavoritePeople(userId: string): Promise<PersonaPreferita[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorite_people")
    .select("person_id, name, role, profile_path")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_PREFERITI);

  return (data ?? []).map((r) => ({
    personId: r.person_id,
    name: r.name,
    role: r.role === "Regia" ? "Regia" : "Cast",
    profilePath: r.profile_path,
  }));
}

/**
 * Le chiavi dei propri preferiti nella forma di `title_people`: `Cast:Pedro Pascal`.
 * `cache` perche' in home la chiedono tre punti diversi nello stesso render.
 */
export const getFavoriteKeys = cache(async (): Promise<string[]> => {
  const viewer = await getViewer();
  if (!viewer) return [];
  const preferiti = await getFavoritePeople(viewer.id);
  return preferiti.map((p) => `${p.role}:${p.name}`);
});

/** Se il viewer ha gia' questa persona fra i preferiti. */
export async function isFavorite(personId: number): Promise<boolean> {
  const viewer = await getViewer();
  if (!viewer) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("favorite_people")
    .select("person_id")
    .eq("user_id", viewer.id)
    .eq("person_id", personId)
    .maybeSingle();
  return Boolean(data);
}

export interface Conoscenza {
  visti: number;
  totale: number;
  /** Voto medio che il viewer da' ai titoli visti di questa persona; `null` se non vota. */
  media: number | null;
}

/**
 * "Hai visto 7 dei suoi 41 titoli - gli dai 8,4 di media".
 *
 * Due `in (...)` sugli id che abbiamo gia' in mano dalla filmografia, senza join su
 * `titles`: qui non serve nessun dato del titolo, solo stato e voto.
 */
export async function conoscenzaDi(crediti: CreditoPersona[]): Promise<Conoscenza> {
  const viewer = await getViewer();
  const totale = crediti.length;
  if (!viewer || totale === 0) return { visti: 0, totale, media: null };

  const supabase = await createClient();
  const idFilm = crediti.filter((c) => c.mediaType === "movie").map((c) => c.id);
  const idSerie = crediti.filter((c) => c.mediaType === "tv").map((c) => c.id);

  const [film, serie] = await Promise.all([
    idFilm.length
      ? supabase
          .from("watch_entries")
          .select("rating")
          .eq("user_id", viewer.id)
          .eq("media_type", "movie")
          .eq("status", "watched")
          .in("title_id", idFilm)
      : Promise.resolve({ data: [] as { rating: number | null }[] }),
    idSerie.length
      ? supabase
          .from("watch_entries")
          .select("rating")
          .eq("user_id", viewer.id)
          .eq("media_type", "tv")
          .eq("status", "watched")
          .in("title_id", idSerie)
      : Promise.resolve({ data: [] as { rating: number | null }[] }),
  ]);

  const righe = [...(film.data ?? []), ...(serie.data ?? [])];
  const voti = righe
    .map((r) => r.rating)
    .filter((r): r is number => typeof r === "number" && r > 0);

  return {
    visti: righe.length,
    totale,
    media: voti.length > 0 ? voti.reduce((a, b) => a + b, 0) / voti.length : null,
  };
}
```

- [ ] **Step 2: Scrivere l'azione**

Create `src/lib/people/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { isTmdbId } from "@/lib/validate";
import { MAX_PREFERITI } from "./queries";

export interface PreferitoResult {
  ok: boolean;
  /** Lo stato **dopo** l'azione: vero = adesso e' fra i preferiti. */
  preferito?: boolean;
  error?: string;
}

/** Un `profile_path` di TMDB e nient'altro: la stringa finisce in un `<Image src>`. */
const PROFILE_PATH = /^\/[A-Za-z0-9._-]{1,60}$/;

export interface PreferitoInput {
  personId: number;
  name: string;
  role: "Cast" | "Regia";
  profilePath: string | null;
}

/**
 * Mette o toglie una persona dai preferiti.
 *
 * Il tetto e' controllato qui e non da un vincolo del database apposta: il vincolo
 * direbbe "new row violates check constraint", questa dice cosa fare.
 */
export async function togglePreferito(input: PreferitoInput): Promise<PreferitoResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato." };

  if (!isTmdbId(input?.personId)) return { ok: false, error: "Richiesta non valida." };
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  if (!name) return { ok: false, error: "Richiesta non valida." };
  const role = input.role === "Regia" ? "Regia" : "Cast";
  const profilePath =
    typeof input.profilePath === "string" && PROFILE_PATH.test(input.profilePath)
      ? input.profilePath
      : null;

  if (!(await rateLimit(`preferiti:${user.id}`, 30, 60))) {
    return { ok: false, error: "Troppe richieste, riprova fra poco." };
  }

  const { data: esistente } = await supabase
    .from("favorite_people")
    .select("person_id")
    .eq("user_id", user.id)
    .eq("person_id", input.personId)
    .maybeSingle();

  if (esistente) {
    const { error } = await supabase
      .from("favorite_people")
      .delete()
      .eq("user_id", user.id)
      .eq("person_id", input.personId);
    if (error) {
      console.error("[persone] rimozione fallita:", error);
      return { ok: false, error: "Non è riuscito, riprova." };
    }
    rinfresca(input.personId);
    return { ok: true, preferito: false };
  }

  const { count } = await supabase
    .from("favorite_people")
    .select("person_id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) >= MAX_PREFERITI) {
    return {
      ok: false,
      error: `Hai già ${MAX_PREFERITI} preferiti: togline uno.`,
    };
  }

  const { error } = await supabase.from("favorite_people").insert({
    user_id: user.id,
    person_id: input.personId,
    name,
    role,
    profile_path: profilePath,
  });
  if (error) {
    console.error("[persone] inserimento fallito:", error);
    return { ok: false, error: "Non è riuscito, riprova." };
  }
  rinfresca(input.personId);
  return { ok: true, preferito: true };
}

/** Le rotte che mostrano i preferiti: la home perché i rail nascono da lì. */
function rinfresca(personId: number) {
  revalidatePath(`/person/${personId}`);
  revalidatePath("/profile");
  revalidatePath("/");
}
```

- [ ] **Step 3: Verificare**

Run: `pnpm typecheck && pnpm lint`
Expected: nessun errore. Se `role` non risulta tipizzato come stringa libera, controllare che `src/types/database.ts` sia quello rigenerato nel Task 1.

- [ ] **Step 4: Commit**

```bash
git add src/lib/people/queries.ts src/lib/people/actions.ts
git commit -m "feat(persone): letture e azione dei preferiti"
```

---

### Task 6: La pagina persona

**Files:**
- Create: `src/app/(app)/person/[id]/page.tsx`
- Create: `src/app/(app)/person/[id]/loading.tsx`
- Create: `src/components/people/PersonHeader.tsx`
- Create: `src/components/people/FavoritePersonButton.tsx`
- Create: `src/components/people/PersonFilmography.tsx`
- Modify: `src/lib/taste/surfaces.ts` (elenco `SURFACES`)

**Interfaces:**
- Consumes: `getPerson` (Task 2), `getPersonMovieCredits`/`getPersonTvCredits` (esistenti), `filmografia`/`CreditoPersona` (Task 3), `isFavorite`/`conoscenzaDi` (Task 5), `togglePreferito` (Task 5), `PosterCard`/`SHELF_CARD_SIZES` (esistente), `TopBar` (esistente), `useMirroredValue` (`@/lib/ui/optimistic`).
- Produces: rotta `/person/[id]`; `FavoritePersonButton` riusabile dal Task 7; superficie di segnale `"person"`.

- [ ] **Step 1: Aggiungere la superficie**

In `src/lib/taste/surfaces.ts`, dentro `SURFACES`, dopo `"title-simili"`:

```ts
  "person",
```

Senza questa riga `parseSignal` scarta gli eventi della pagina persona e le copertine aperte da lì non contano nel profilo di gusto.

- [ ] **Step 2: Il cuore (client)**

Create `src/components/people/FavoritePersonButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useMirroredValue } from "@/lib/ui/optimistic";
import { togglePreferito } from "@/lib/people/actions";

/**
 * Cuore "persona preferita": toggle ottimistico, al massimo 12 (il rifiuto arriva dal
 * server come toast). Lo usano la testata della pagina persona e le righe del cast.
 */
export function FavoritePersonButton({
  personId,
  name,
  role,
  profilePath,
  favorite,
  size = 40,
}: {
  personId: number;
  name: string;
  role: "Cast" | "Regia";
  profilePath: string | null;
  favorite: boolean;
  /** 40 in testata, 32 nella riga del cast. */
  size?: 32 | 40;
}) {
  const router = useRouter();
  const { value: on, pending, run } = useMirroredValue(favorite);

  function toggle(e: React.MouseEvent) {
    // la riga del cast e' un link: il cuore non deve navigare
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    // `togglePreferito` risponde `{ ok, error? }`: quando il tetto e' pieno,
    // `useMirroredValue` mostra da solo `error` come toast e torna indietro.
    run(!on, () => togglePreferito({ personId, name, role, profilePath }), {
      onDone: () => router.refresh(),
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `Togli ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`}
      style={{ width: size, height: size }}
      className={`glass flex shrink-0 items-center justify-center rounded-full transition-colors ${
        on ? "text-accent-light" : "text-text"
      } ${pending ? "opacity-70" : ""}`}
    >
      <svg
        width={size === 40 ? 19 : 16}
        height={size === 40 ? 19 : 16}
        viewBox="0 0 24 24"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 3: La testata (server)**

Create `src/components/people/PersonHeader.tsx`:

```tsx
import Image from "next/image";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import { Overview } from "@/components/title/Overview";
import { FavoritePersonButton } from "./FavoritePersonButton";
import type { Conoscenza } from "@/lib/people/queries";

/**
 * Testata della pagina persona: foto, nome, reparto, cuore, e la riga che dice quanto
 * la conosci. La biografia sta qui e non in una pagina sua: come per "Vedi tutto il
 * cast", si espande sul posto.
 *
 * `known_for_department` non dice il genere della persona, quindi il reparto si
 * traduce con parole che valgono per tutti: "Interprete", non "Attore".
 */
export function PersonHeader({
  personId,
  name,
  biography,
  profilePath,
  role,
  favorite,
  conoscenza,
}: {
  personId: number;
  name: string;
  biography: string | null;
  profilePath: string | null;
  role: "Cast" | "Regia";
  favorite: boolean;
  conoscenza: Conoscenza;
}) {
  const media =
    conoscenza.media != null
      ? conoscenza.media.toLocaleString("it-IT", { maximumFractionDigits: 1 })
      : null;

  return (
    <section className="flex flex-col gap-4 px-5 pb-2 lg:px-10">
      <div className="flex items-center gap-4">
        <div className="relative size-[88px] shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-surface-2 lg:size-[112px]">
          {profilePath ? (
            <Image
              src={`${TMDB_IMAGE_BASE}/w185${profilePath}`}
              alt={name}
              fill
              priority
              sizes="112px"
              className="object-cover object-[50%_20%]"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-3xl text-muted">
              {name.charAt(0)}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-[28px] font-bold leading-tight tracking-[-0.04em] lg:text-[34px]">
            {name}
          </h2>
          <p className="text-sm text-muted">
            {role === "Regia" ? "Regia" : "Interprete"}
          </p>
        </div>

        <FavoritePersonButton
          personId={personId}
          name={name}
          role={role}
          profilePath={profilePath}
          favorite={favorite}
        />
      </div>

      {conoscenza.visti > 0 && (
        <p className="text-[13px] text-muted">
          Hai visto {conoscenza.visti} {conoscenza.visti === 1 ? "titolo" : "titoli"} su{" "}
          {conoscenza.totale}
          {media ? ` · gli dai ${media} di media` : ""}
        </p>
      )}

      {biography && (
        <Overview text={biography} className="" size={15} heading={false} />
      )}
    </section>
  );
}
```

`Overview` è il componente che la scheda titolo usa per la trama troncata con "Leggi tutto" (`text`, `className`, `size: 15 | 16`, `heading`): va riusato così com'è, non riscritto.

- [ ] **Step 4: Le pillole e la griglia (client)**

Create `src/components/people/PersonFilmography.tsx`:

```tsx
"use client";

import { useState } from "react";
import { PosterCard } from "@/components/ui/PosterCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CreditoPersona } from "@/lib/people/filmography";

/**
 * Filmografia con le pillole Tutto / Film / Serie TV, le stesse della home. Filtra in
 * locale: i crediti arrivano gia' tutti dal server, cambiare pillola non ricarica
 * nulla.
 */

type Scheda = "all" | "movie" | "tv";

const SCHEDE: { key: Scheda; label: string }[] = [
  { key: "all", label: "Tutto" },
  { key: "movie", label: "Film" },
  { key: "tv", label: "Serie TV" },
];

const GRID =
  "grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10";

export function PersonFilmography({
  sezioni,
}: {
  /** Una o due sezioni: "Come interprete", "Come regista". */
  sezioni: { titolo: string; crediti: CreditoPersona[] }[];
}) {
  const [scheda, setScheda] = useState<Scheda>("all");
  const filtra = (c: CreditoPersona[]) =>
    scheda === "all" ? c : c.filter((x) => x.mediaType === scheda);

  const vuoto = sezioni.every((s) => filtra(s.crediti).length === 0);

  return (
    <div className="flex flex-col gap-6 px-5 lg:px-10">
      <div
        role="tablist"
        aria-label="Tutto, film o serie TV"
        className="glass flex h-10 w-full items-center rounded-full p-1 lg:w-auto lg:self-start"
      >
        {SCHEDE.map((s) => {
          const attiva = s.key === scheda;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={attiva}
              onClick={() => setScheda(s.key)}
              className={`h-8 flex-1 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition-colors lg:flex-none lg:px-4 ${
                attiva ? "bg-white/[0.16] text-white" : "text-white/60"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {vuoto && (
        <EmptyState
          title="Niente da mostrare"
          description="Con questo filtro non resta nessun titolo."
        />
      )}

      {sezioni.map((sezione) => {
        const crediti = filtra(sezione.crediti);
        if (crediti.length === 0) return null;
        return (
          <section key={sezione.titolo} className="flex flex-col gap-3.5">
            {sezioni.length > 1 && (
              <h2 className="text-xl font-bold tracking-[-0.03em]">{sezione.titolo}</h2>
            )}
            <div className={GRID}>
              {crediti.map((c, i) => (
                <PosterCard
                  key={`${c.mediaType}-${c.id}`}
                  title={c.title}
                  posterPath={c.posterPath}
                  year={c.year}
                  rating={c.voteAverage}
                  href={`/title/${c.mediaType}/${c.id}`}
                  signal={{ surface: "person", position: i }}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: La pagina**

Create `src/app/(app)/person/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { getPerson, getPersonMovieCredits, getPersonTvCredits } from "@/lib/tmdb/client";
import { filmografia } from "@/lib/people/filmography";
import { conoscenzaDi, isFavorite } from "@/lib/people/queries";
import { PersonHeader } from "@/components/people/PersonHeader";
import { PersonFilmography } from "@/components/people/PersonFilmography";

type Props = { params: Promise<{ id: string }> };

function idValido(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n < 1e12 ? n : null;
}

export async function generateMetadata({ params }: Props) {
  const id = idValido((await params).id);
  if (!id) return { title: "Persona non trovata" };
  const persona = await getPerson(id).catch(() => null);
  return { title: persona?.name ?? "Persona non trovata" };
}

/**
 * La pagina di un attore o di un regista: testata, quanto lo conosci, filmografia.
 *
 * Nessuna cache in Postgres: `getPerson` e le due filmografie hanno gia' un giorno di
 * `revalidate` dentro `tmdbFetch`, e una tabella `persons` sarebbe un secondo posto in
 * cui la stessa biografia invecchia.
 */
export default async function PersonPage({ params }: Props) {
  const id = idValido((await params).id);
  if (!id) notFound();

  const persona = await getPerson(id).catch(() => null);
  if (!persona) notFound();

  const [movieCredits, tvCredits] = await Promise.all([
    getPersonMovieCredits(id).catch(() => null),
    getPersonTvCredits(id).catch(() => null),
  ]);

  const { interprete, regista } = filmografia(movieCredits, tvCredits);
  const role = persona.known_for_department === "Directing" ? "Regia" : "Cast";

  const [preferito, conoscenza] = await Promise.all([
    isFavorite(id),
    conoscenzaDi([...interprete, ...regista]),
  ]);

  const sezioni = [
    { titolo: "Come interprete", crediti: interprete },
    { titolo: "Come regista", crediti: regista },
  ].filter((s) => s.crediti.length > 0);

  return (
    <>
      <TopBar title={persona.name} back />
      <main className="flex flex-col gap-6 pb-16">
        <PersonHeader
          personId={id}
          name={persona.name}
          biography={persona.biography}
          profilePath={persona.profile_path}
          role={role}
          favorite={preferito}
          conoscenza={conoscenza}
        />
        {sezioni.length > 0 && <PersonFilmography sezioni={sezioni} />}
      </main>
    </>
  );
}
```

- [ ] **Step 6: Lo scheletro**

Create `src/app/(app)/person/[id]/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="flex flex-col gap-6 px-5 pb-16 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
      <Skeleton className="h-10 w-48 rounded" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-[88px] shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-2/3 rounded" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>
      </div>
      <Skeleton className="h-10 w-full rounded-full lg:w-64" />
      <div className="grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="aspect-[2/3] w-full rounded-[14px]" />
            <Skeleton className="h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Verificare**

Run: `pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-persone pnpm build`
Expected: build verde, fra le rotte compare `/person/[id]`.

- [ ] **Step 8: Provarla davvero**

Run: `NEXT_DIST_DIR=.next-persone pnpm exec next start -p 3399`
Aprire `http://localhost:3399/person/2524` (Tom Hardy) da un browser con sessione.
Expected: testata con foto e nome, pillole che filtrano, locandine che aprono la scheda titolo. Il cuore acceso resta acceso dopo un ricaricamento.

> Serve `.env.local` **prima** del build: senza, la CSP blocca Supabase e il login resta appeso.

- [ ] **Step 9: Commit**

```bash
git add src/app/\(app\)/person src/components/people src/lib/taste/surfaces.ts
git commit -m "feat(persone): pagina persona con filmografia e cuore"
```

---

### Task 7: Gli ingressi dalla scheda titolo

**Files:**
- Modify: `src/components/title/CastRow.tsx`
- Modify: `src/components/title/CastSection.tsx`
- Modify: `src/components/title/TitleAbout.tsx` (il `<dd>` dentro il `<dl>` dei fatti)

**Interfaces:**
- Consumes: `FavoritePersonButton` (Task 6), `getFavoritePeople` (Task 5), `TitleFact.persone` (Task 2).
- Produces: `CastRow` accetta `preferiti?: number[]` (id delle persone già preferite dal viewer).

**Contesto che il resto del piano non può sapere.** Su questo ramo la riga del cast ha **già** un cuore, ma vuol dire un'altra cosa: vota il *personaggio* preferito di quel titolo (`src/lib/characters/`, grafico `CharacterChart` in fondo alla sezione). Decisione dell'utente del 2026-09-14: **il gesto di voto sparisce dalla riga**, il grafico e i dati già votati **restano**. Al suo posto, sulla riga, va il cuore dell'attore preferito.

Quindi in questo task si **toglie** il voto del personaggio dalla riga (bottone, `toggle`, `useOptimisticValue`, e l'evidenziazione `mine` sull'avatar, che è parte della stessa UI di voto) e si **tiene** tutto il resto della funzione: `buildCharacterChart`, `CharacterChart`, `getCharacterVotes`, la tabella. Non toccare `src/lib/characters/actions.ts`, `queries.ts`, `rank.ts` né la loro migration: le azioni restano nel codice, semplicemente nessuna UI le chiama più.

- [ ] **Step 1: Togliere il voto dalla riga e renderla un link**

In `src/components/title/CastRow.tsx`:

1. negli import, **rimuovere** `setFavoriteCharacter`, `clearFavoriteCharacter`, `applyVote` e `useOptimisticValue`; **tenere** `primaryCharacter`, `buildCharacterChart`, `CharacterChart`, `CharacterVotes`; **aggiungere**:

```tsx
import Link from "next/link";
import { FavoritePersonButton } from "@/components/people/FavoritePersonButton";
```

2. aggiungere la prop `preferiti` alla firma, accanto a quelle esistenti:

```tsx
  /** Id delle persone gia' preferite dal viewer: accende il cuore senza una query per riga. */
  preferiti = [],
```

```tsx
  preferiti?: number[];
```

3. **rimuovere** il blocco `const { value, run } = useOptimisticValue<CharacterVotes>(...)` e l'intera funzione `toggle`, e far leggere il grafico direttamente dai voti del server:

```tsx
  const chart = useMemo(
    () => buildCharacterChart(votes?.counts ?? [], cast.slice(0, 20), votes?.myPersonId ?? null),
    [votes, cast],
  );
```

4. `canVote` non esiste più come nome giusto: diventa

```tsx
  /** I voti del personaggio si mostrano ancora; si votava dalla riga, adesso non piu'. */
  const mostraGrafico = votes !== null;
```

e il blocco in fondo alla sezione usa `mostraGrafico` al posto di `canVote`. Le prop `titleId` e `mediaType` non servono più a `CastRow`: toglierle dalla firma e dal punto in cui `CastSection` le passa.

5. sostituire il corpo del `<li>` con la riga cliccabile più il cuore dell'attore (il `<ul>`, il bottone "+N" e il grafico non cambiano):

```tsx
            <li key={member.id} className="flex items-center gap-3">
              <Link
                href={`/person/${member.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="relative size-[46px] shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-surface-2">
                  {member.profile_path ? (
                    <Image
                      src={`${TMDB_IMAGE_BASE}/w185${member.profile_path}`}
                      alt={member.name}
                      fill
                      sizes="46px"
                      className="object-cover object-[50%_20%]"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-sm text-muted">
                      {member.name.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-sm font-semibold">{member.name}</p>
                  {member.character && (
                    <p className="truncate text-xs text-muted">
                      {primaryCharacter(member.character)}
                    </p>
                  )}
                </div>
              </Link>
              <FavoritePersonButton
                personId={member.id}
                name={member.name}
                role="Cast"
                profilePath={member.profile_path}
                favorite={preferiti.includes(member.id)}
                size={32}
              />
            </li>
```

Il `.map` non ha più bisogno della variabile `mine`: torna a essere `{shown.map((member) => (`, con la parentesi tonda.

6. il componente locale `HeartIcon` in fondo al file non lo usa più nessuno: **rimuoverlo**. `FavoritePersonButton` porta il suo.

- [ ] **Step 2: Passare i preferiti dal wrapper server**

In `src/components/title/CastSection.tsx`, che ha già il viewer in mano:

```tsx
import { getViewer } from "@/lib/auth/viewer";
import { getCharacterVotes } from "@/lib/characters/queries";
import { getFavoritePeople } from "@/lib/people/queries";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { CastRow } from "./CastRow";

/**
 * Cast con i cuori degli attori preferiti e il grafico dei personaggi. Legge
 * entrambi con la sessione; da sloggato passa `votes` nullo e nessun preferito, e
 * `CastRow` resta il solo elenco. Sta dietro un `Suspense` il cui fallback e' il
 * cast nudo, cosi' l'elenco non aspetta il DB.
 */
export async function CastSection({
  cast,
  titleId,
  mediaType,
}: {
  cast: TmdbCastMember[];
  titleId: number;
  mediaType: "movie" | "tv";
}) {
  const viewer = await getViewer();
  const [votes, preferiti] = viewer
    ? await Promise.all([
        getCharacterVotes(viewer.id, titleId, mediaType),
        getFavoritePeople(viewer.id),
      ])
    : [null, []];
  return (
    <CastRow cast={cast} votes={votes} preferiti={preferiti.map((p) => p.personId)} />
  );
}
```

`titleId` e `mediaType` restano nella firma di `CastSection` perché servono a `getCharacterVotes`; è solo `CastRow` che non li riceve più.

- [ ] **Step 3: Rendere cliccabile la riga "Regia"**

In `src/components/title/TitleAbout.tsx`, aggiungere `import Link from "next/link";` in testa e sostituire il `<dd>` del fatto:

```tsx
                <dd className="text-[13px] font-medium leading-[1.35] text-white/[0.92]">
                  {f.persone && f.persone.length > 0
                    ? f.persone.map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && ", "}
                          <Link
                            href={`/person/${p.id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {p.name}
                          </Link>
                        </span>
                      ))
                    : f.value}
                </dd>
```

- [ ] **Step 4: Verificare**

Run: `pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-persone pnpm build`
Expected: verde. Se `typecheck` segnala `titleId`/`mediaType` non usati in `CastRow`, è il segno che il punto 4 dello Step 1 non è stato completato.

- [ ] **Step 5: Provare**

Run: `NEXT_DIST_DIR=.next-persone pnpm exec next start -p 3399`
Aprire un film: toccare un nome del cast apre `/person/<id>`; toccare il cuore **non** naviga e accende il cuore; il grafico "Personaggio preferito" è ancora in fondo alla sezione e mostra i voti già dati; il nome sotto "Regia" apre la pagina del regista.

- [ ] **Step 6: Commit**

```bash
git add src/components/title/CastRow.tsx src/components/title/CastSection.tsx src/components/title/TitleAbout.tsx
git commit -m "feat(persone): dal cast e dalla regia alla pagina persona"
```

---

### Task 8: Le persone nella ricerca

**Files:**
- Modify: `src/lib/tmdb/types.ts` (`TmdbPersonResult`, riga ~61)
- Modify: `src/lib/tmdb/mappers.ts` (accanto a `SearchItem`, riga ~15)
- Modify: `src/lib/search/instant.ts`
- Modify: `src/app/api/search/route.ts`
- Modify: `src/app/(app)/search/SearchClient.tsx`

**Interfaces:**
- Consumes: `searchMulti` (`@/lib/tmdb/client`).
- Produces: `interface SearchPerson { id, name, profilePath, role }`; `instantPeople(query): Promise<SearchPerson[]>`; `/api/search` risponde `{ results: SearchItem[]; people: SearchPerson[] }`.

**Contesto che il resto del piano non può sapere.** La logica della ricerca non sta più nella rotta: è in `src/lib/search/instant.ts` (`instantSearch`), **condivisa** con `/api/tv/v1/search`. Il contratto di `instantSearch` non si tocca: la app TV si aspetta un `SearchItem[]` e basta. Le persone arrivano da una funzione sorella nello stesso file.

- [ ] **Step 1: Completare il tipo del risultato persona**

In `src/lib/tmdb/types.ts`, `TmdbPersonResult` oggi dichiara solo `name`. Aggiungere i due campi che servono:

```ts
export interface TmdbPersonResult extends TmdbSearchResultBase {
  media_type: "person";
  name: string;
  profile_path?: string | null;
  known_for_department?: string;
}
```

- [ ] **Step 2: Il tipo del risultato mostrato**

In `src/lib/tmdb/mappers.ts`, subito dopo `SearchItem`:

```ts
/** Una persona fra i risultati della ricerca: apre la sua pagina, niente voti. */
export interface SearchPerson {
  id: number;
  name: string;
  profilePath: string | null;
  role: "Cast" | "Regia";
}
```

- [ ] **Step 3: `instantPeople`**

In coda a `src/lib/search/instant.ts` (e aggiungere `SearchPerson` all'import dai mapper):

```ts
/** Quante persone: piu' di quattro e la riga diventa un secondo elenco. */
const PEOPLE_LIMIT = 4;

/**
 * Le persone della stessa ricerca. Funzione a parte, e non un secondo campo di
 * `instantSearch`, perche' quella la usa anche l'app TV, che di persone non sa nulla:
 * cambiarle il tipo di ritorno per un bisogno del web sarebbe una modifica a due
 * consumatori per servirne uno. `searchMulti` e' la stessa richiesta HTTP, quindi
 * Next la serve dalla cache della richiesta: chiamarla due volte non costa una
 * seconda chiamata a TMDB.
 *
 * Solo chi recita o dirige, e solo con una foto: gli altri reparti riempirebbero la
 * riga di nomi che a chi cerca un film non dicono nulla. Nessun voto e nessun
 * provider: per le persone non esistono.
 */
export async function instantPeople(query: string): Promise<SearchPerson[]> {
  const search = await searchMulti(query);
  const out: SearchPerson[] = [];
  for (const r of search.results) {
    if (r.media_type !== "person") continue;
    if (!r.profile_path) continue;
    if (r.known_for_department !== "Acting" && r.known_for_department !== "Directing") {
      continue;
    }
    out.push({
      id: r.id,
      name: r.name,
      profilePath: r.profile_path,
      role: r.known_for_department === "Directing" ? "Regia" : "Cast",
    });
    if (out.length === PEOPLE_LIMIT) break;
  }
  return out;
}
```

- [ ] **Step 4: Restituirle dalla rotta web**

In `src/app/api/search/route.ts`, importare anche `instantPeople` e cambiare la risposta del ramo buono:

```ts
    const [results, people] = await Promise.all([
      instantSearch(query),
      instantPeople(query),
    ]);
    return NextResponse.json(
      { results, people },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
```

La rotta TV (`src/app/api/tv/v1/search/route.ts`) **non si tocca**.

- [ ] **Step 5: Mostrarle nel client**

In `src/app/(app)/search/SearchClient.tsx`:

1. importare `Image` da `next/image`, `Link` da `next/link`, `TMDB_IMAGE_BASE` da `@/lib/config` e `SearchPerson` da `@/lib/tmdb/mappers`;
2. lo stato e la cache tengono entrambe le liste:

```tsx
  const [people, setPeople] = useState<SearchPerson[]>([]);
  const cacheRef = useRef<Map<string, { results: SearchItem[]; people: SearchPerson[] }>>(
    new Map(),
  );
```

3. nel `useEffect`, dove oggi si svuota, si legge la cache e si fa l'anteprima per prefisso:

```tsx
    if (q.length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setPeople([]);
      setSearched(false);
      setPending(false);
      return;
    }

    const cache = cacheRef.current;
    const key = fold(q);
    const hit = cache.get(key);
    if (hit) {
      abortRef.current?.abort();
      setResults(hit.results);
      setPeople(hit.people);
      setSearched(true);
      setPending(false);
      return;
    }

    // anteprima: il prefisso più lungo già in cache, filtrato sul testo nuovo
    for (let len = key.length - 1; len >= 2; len--) {
      const prev = cache.get(key.slice(0, len));
      if (!prev) continue;
      const preview = prev.results.filter((r) => fold(r.title).includes(key));
      if (preview.length > 0) setResults(preview);
      setPeople(prev.people.filter((p) => fold(p.name).includes(key)));
      break;
    }
```

4. nella risposta della fetch, e nel `catch`:

```tsx
        const data = (await res.json()) as {
          results: SearchItem[];
          people?: SearchPerson[];
        };
        const persone = data.people ?? [];
        cache.set(key, { results: data.results, people: persone });
        if (controller.signal.aborted) return;
        setResults(data.results);
        setPeople(persone);
```

(nel `catch`, `setPeople([]);` accanto a `setResults([]);`)

5. la riga delle persone, **sopra** il blocco `{results.length > 0 && (`:

```tsx
      {people.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-3 text-[13px] font-semibold text-muted">Persone</h2>
          <ul className="scrollbar-none flex gap-4 overflow-x-auto">
            {people.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/person/${p.id}`}
                  className="flex w-20 flex-col items-center gap-2 text-center"
                >
                  <div className="relative size-16 overflow-hidden rounded-full border border-white/[0.08] bg-surface-2">
                    {p.profilePath && (
                      <Image
                        src={`${TMDB_IMAGE_BASE}/w185${p.profilePath}`}
                        alt={p.name}
                        fill
                        sizes="64px"
                        className="object-cover object-[50%_20%]"
                      />
                    )}
                  </div>
                  <span className="line-clamp-2 text-xs font-medium">{p.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
```

6. il "Nessun risultato" tiene conto anche delle persone:

```tsx
      {!pending && searched && results.length === 0 && people.length === 0 && (
```

- [ ] **Step 6: Verificare**

Run: `pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-persone pnpm build`
Expected: verde.

- [ ] **Step 7: Provare**

Con il server avviato, cercare "nolan": compare la riga "Persone" con la sua foto, e toccandola si apre `/person/525`. Cercare "dune": la riga "Persone" non copre i titoli, che restano i primi risultati.

- [ ] **Step 8: Commit**

```bash
git add src/lib/tmdb/types.ts src/lib/tmdb/mappers.ts src/lib/search/instant.ts src/app/api/search/route.ts "src/app/(app)/search/SearchClient.tsx"
git commit -m "feat(persone): le persone fra i risultati della ricerca"
```

---

### Task 9: Lo scaffale sul profilo

**Files:**
- Create: `src/components/people/FavoritePeopleShelf.tsx`
- Modify: `src/app/(app)/profile/page.tsx`
- Modify: `src/app/(app)/u/[username]/page.tsx`

**Interfaces:**
- Consumes: `getFavoritePeople` (Task 5), `HorizontalShelf` (esistente).
- Produces: `<FavoritePeopleShelf persone={...} titolo="..." />`.

- [ ] **Step 1: Lo scaffale**

Create `src/components/people/FavoritePeopleShelf.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import type { PersonaPreferita } from "@/lib/people/queries";

/**
 * I preferiti come cerchi in fila. Nome e foto arrivano dalla riga di
 * `favorite_people`: nessuna chiamata TMDB per disegnare lo scaffale.
 */
export function FavoritePeopleShelf({
  persone,
  titolo = "Attori e registi preferiti",
}: {
  persone: PersonaPreferita[];
  titolo?: string;
}) {
  if (persone.length === 0) return null;
  return (
    <HorizontalShelf title={titolo}>
      {persone.map((p) => (
        <Link
          key={p.personId}
          href={`/person/${p.personId}`}
          className="flex w-20 shrink-0 flex-col items-center gap-2 text-center md:w-24"
        >
          <div className="relative size-[72px] overflow-hidden rounded-full border border-white/[0.08] bg-surface-2 md:size-20">
            {p.profilePath ? (
              <Image
                src={`${TMDB_IMAGE_BASE}/w185${p.profilePath}`}
                alt={p.name}
                fill
                sizes="80px"
                className="object-cover object-[50%_20%]"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-xl text-muted">
                {p.name.charAt(0)}
              </span>
            )}
          </div>
          <span className="line-clamp-2 text-xs font-medium">{p.name}</span>
        </Link>
      ))}
    </HorizontalShelf>
  );
}
```

- [ ] **Step 2: Sul proprio profilo**

In `src/app/(app)/profile/page.tsx`: aggiungere gli import

```tsx
import { getFavoritePeople } from "@/lib/people/queries";
import { FavoritePeopleShelf } from "@/components/people/FavoritePeopleShelf";
```

aggiungere `getFavoritePeople(user.id)` come ultima voce del `Promise.all` esistente (e `preferitiPersone` come ultimo nome della destrutturazione), e rendere lo scaffale subito **dopo** `<TopRatedShelf .../>`:

```tsx
        <FavoritePeopleShelf persone={preferitiPersone} />
```

- [ ] **Step 3: Sul profilo altrui**

In `src/app/(app)/u/[username]/page.tsx`: stessi import, `getFavoritePeople(targetId)` come ultima voce del `Promise.all`, e lo scaffale nello stesso punto:

```tsx
        <FavoritePeopleShelf
          persone={preferitiPersone}
          titolo={`Preferiti di ${target.display_name ?? target.username}`}
        />
```

Nessun `if` sui permessi: la policy `favorite_people_select` restituisce un elenco vuoto per chi non è amico, e lo scaffale vuoto non si disegna. Se `target` non ha `display_name`, usare il nome che la pagina già mostra in testata.

- [ ] **Step 4: Verificare**

Run: `pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-persone pnpm build`
Expected: verde.

- [ ] **Step 5: Provare**

Preferire due persone, aprire `/profile`: i due cerchi ci sono, in ordine di aggiunta più recente. Aprire il profilo di un utente **non amico**: lo scaffale non compare.

- [ ] **Step 6: Commit**

```bash
git add src/components/people/FavoritePeopleShelf.tsx "src/app/(app)/profile/page.tsx" "src/app/(app)/u/[username]/page.tsx"
git commit -m "feat(persone): scaffale dei preferiti sui due profili"
```

---

### Task 10: I preferiti dentro i consigli

**Files:**
- Modify: `src/lib/rank/engine.ts` (righe ~92 e ~155)
- Modify: `src/lib/moment/shelf.ts` (riga ~225)

**Interfaces:**
- Consumes: `applicaPreferiti` (Task 4), `getFavoriteKeys` (Task 5).
- Produces: nessuna nuova interfaccia. Da qui in poi `buildRails` produce «Ancora con X» e l'affinità tiene conto dei preferiti, senza altre modifiche.

- [ ] **Step 1: Applicarli nel motore**

In `src/lib/rank/engine.ts`, aggiungere gli import

```ts
import { applicaPreferiti } from "./vector";
import { getFavoriteKeys } from "@/lib/people/queries";
```

(`applicaPreferiti` va accanto a `toTasteVector`, che è già importato dalla stessa riga) e in **entrambi** i punti sostituire

```ts
  const vettore = toTasteVector(profilo);
```

con

```ts
  const vettore = applicaPreferiti(toTasteVector(profilo), await getFavoriteKeys());
```

Alla riga ~155 la variabile è `toTasteVector(profilo ?? null)`: la sostituzione è la stessa, tenendo il `?? null`.

`getFavoriteKeys` è avvolta in `cache()`: chiamarla in tre punti dello stesso render costa una query sola.

- [ ] **Step 2: Applicarli nella fila del momento**

In `src/lib/moment/shelf.ts`, stessi import e stessa sostituzione alla riga ~225.

- [ ] **Step 3: Verificare**

Run: `pnpm test && pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-persone pnpm build`
Expected: verde. Se il build segnala che `queries.ts` (`server-only`) viene tirato in un bundle client, la catena di import passa da un componente client: fermarsi e segnalarlo invece di togliere `server-only`.

- [ ] **Step 4: Provare**

Preferire un attore che compare in almeno sei titoli del catalogo, poi aprire la home: fra le file personali deve comparire «Ancora con <nome>». Se non compare, controllare che il nome salvato in `favorite_people.name` sia **identico** a quello che `title_people` estrae da `titles.raw` (stessa grafia, stessi accenti): il confronto è per stringa esatta.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rank/engine.ts src/lib/moment/shelf.ts
git commit -m "feat(persone): i preferiti pesano nei consigli e aprono un rail"
```

---

### Task 11: La pagina di architettura

**Files:**
- Create: `docs/architecture/people.md`
- Modify: `CLAUDE.md` (tabella "Mappa dei sottosistemi")

**Interfaces:** nessuna. È il passo che rende il lavoro leggibile alla prossima sessione.

- [ ] **Step 1: Scrivere la pagina**

Create `docs/architecture/people.md` con, nell'ordine: a cosa serve la funzione; la tabella `favorite_people` e perché il ruolo è uno solo; perché non esiste una cache Postgres delle persone; cosa fa `filmography.ts` e quali crediti butta via; come il preferito entra nel vettore (`applicaPreferiti`) e perché il confronto è per **nome esatto** contro `title_people`; il tetto di 12 e dove è controllato; i quattro punti d'ingresso.

Scrivere **solo ciò che il codice non dice**: le ragioni, le trappole, quello che è già stato provato. La struttura dei file si legge dai file.

Trappole da annotare, perché sono quelle che costeranno tempo a chi viene dopo:

- il legame fra `favorite_people.role`/`name` e le etichette di `title_people` è **per stringa**: cambiare l'una senza l'altra spegne i rail in silenzio, senza nessun errore;
- `getFavoriteKeys` è in `cache()`: chiamarla più volte nello stesso render è gratis, chiamarla da un componente client è impossibile (`server-only`);
- una persona ha un solo `role` anche se dirige e recita, perché la chiave primaria è `(user_id, person_id)`.

- [ ] **Step 2: La riga nell'indice**

In `CLAUDE.md`, nella tabella "Mappa dei sottosistemi", dopo la riga di `genres.md`:

```markdown
| [people.md](docs/architecture/people.md) | Attori e registi preferiti, pagina persona, filmografia, peso nei consigli. |
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/people.md CLAUDE.md
git commit -m "docs(persone): pagina di architettura e riga nell'indice"
```

---

## Verifica finale

Dopo l'ultimo task, prima di considerare il lavoro finito:

- [ ] `pnpm test` — verdi, compresi i test nuovi di `filmography`, `regiaConId`, `applicaPreferiti`.
- [ ] `pnpm typecheck && pnpm lint`
- [ ] `NEXT_DIST_DIR=.next-persone pnpm build` — fra le rotte compare `/person/[id]`.
- [ ] `node scripts/security-check.mjs` — `favorite_people` con RLS attiva, niente ad `anon`.
- [ ] A mano, col server avviato: cast → pagina persona; cuore dal cast; cuore dalla testata; ricerca di un regista; scaffale sul proprio profilo; scaffale assente sul profilo di un non amico; rail «Ancora con X» in home.

Il rilascio **non** fa parte di questo piano: si pubblica solo via `origin/main` con `scripts/rilascio.mjs`.

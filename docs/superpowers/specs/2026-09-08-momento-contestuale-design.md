# Il momento giusto: una fila che sa che ore sono, dove sei e se piove

Spec di design — 2026-09-08

## Il problema

La home di Zapp sa **chi** sei (profilo di gusto, fase A; motore di ranking, fase C) ma
non sa **quando** stai guardando. Alle 13 di un martedì e alle 23 di una domenica di
pioggia propone le stesse identiche file. Un consiglio giusto non dipende solo dal gusto:
dipende dall'ora che è, dal giorno che è e da cosa si vede fuori dalla finestra.

Aggiungiamo **una sola fila**, in cima ai consigli, che nasce dal contesto:

> _Adesso a Milano · piove_
> **Per una domenica di pioggia**

e, sopra di essa, sei pillole con cui l'utente può dire come si sente e riscrivere la fila
sul posto.

## Cosa non è

- **Non** è una home nuova né una sezione con tre file quasi uguali: una fila, una sola.
- **Non** chiede un permesso nuovo. Usa la posizione che l'utente ha già dato al cinema.
  Se non c'è, la fila resta e parla di ora e giorno.
- **Non** salva niente nel database: nessuna migration, nessuna tabella, nessun mood
  scritto da qualche parte. Il mood dura quanto la sessione.
- **Non** chiama niente dal browser: il meteo lo chiede il server. La CSP resta invariata.
- **Non** rimpiazza il motore di ranking: lo usa per l'ordine.

## 1. Il contesto — `src/lib/moment/context.ts` (puro, Vitest)

```ts
export type Meteo = "pioggia" | "neve" | "sereno" | "caldo" | "freddo";

export interface MomentContext {
  /** 0-23, fuso di Roma. */
  ora: number;
  /** 0 = domenica. */
  giorno: number;
  /** 1-12. */
  mese: number;
  meteo: Meteo | null;
}

export function contextAt(now: Date, meteo: Meteo | null): MomentContext;
```

**L'ora non è quella del server.** Le funzioni Vercel girano in `fra1` con orologio UTC:
alle 23:40 italiane `new Date().getHours()` risponde 21 (22 in inverno) e "Notte fonda" non
sarebbe mai uscita, mentre "Pausa pranzo" sarebbe comparsa alle 14 vere. L'ora, il giorno
e il mese si ricavano con `Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", … })`
e `formatToParts`, non con i getter locali. `contextAt` prende la data come argomento:
è così che i test possono affermare che il 2026-06-21 alle 23:40 di Roma è "notte fonda"
senza toccare l'orologio di sistema.

Il fuso è uno solo perché l'app è una sola: Zapp è in italiano, per l'Italia (vedi la
regola della lingua in `CLAUDE.md`). Il giorno in cui servisse un secondo fuso, è un
parametro di `contextAt`, non una riscrittura.

## 2. Il meteo — `src/lib/moment/weather.ts` (`server-only`)

Sorgente: **Open-Meteo**, gratuita, senza chiave, senza account.

```
GET https://api.open-meteo.com/v1/forecast
    ?latitude=45.5&longitude=9.2
    &current=temperature_2m,weather_code
    &timezone=Europe%2FRome
```

Coordinate da `user_locations` (`lat`, `lng`, `label`), la tabella privata già creata per
il cinema (migration 0009, RLS solo proprietario).

**Le coordinate si arrotondano a 0,1° prima di formare la chiave di cache** (~11 km):
mille utenti della stessa città diventano una chiamata sola. `unstable_cache` per cella,
30 minuti. Fuori da questo il costo crescerebbe con gli utenti invece che con le città.

- Timeout 3 s (`AbortSignal.timeout`), come i client MyMovies e JustWatch.
- Qualunque errore — rete, 4xx, JSON storto — vale `null`: la fila esce lo stesso con
  ora e giorno. **Il meteo non è mai bloccante.**
- Rate limit per utente dichiarato al punto di chiamata (`src/lib/rate-limit.ts`, 20/min):
  è una chiamata esterna, e la regola di progetto è che ogni chiamata esterna ne ha uno.
  La cache per cella fa già quasi tutto il lavoro; il limite è la rete di sicurezza.

### I codici WMO → categoria (funzione pura, testata)

| Codice WMO | Categoria |
|---|---|
| 51–67, 80–82, 95–99 (pioviggine, pioggia, rovesci, temporali) | `pioggia` |
| 71–77, 85–86 (neve) | `neve` |
| 0–3, 45–48 (sereno, nuvoloso, nebbia) | `sereno` |

Poi la temperatura corregge, ma **solo se non piove e non nevica**: `≥ 28 °C` → `caldo`,
`≤ 4 °C` → `freddo`. La pioggia batte il termometro: un 3 °C con la pioggia resta una
giornata di pioggia, non una giornata fredda.

## 3. Le ricette — `src/lib/moment/recipes.ts` (puro, Vitest)

Un momento è **un dato**, non del codice. Quali file compaiono in home e come si chiamano
è una scelta di prodotto, e va letta in un file (stessa ragione per cui `rails.ts` è puro
e testato).

```ts
export interface Recipe {
  /** Chiave stabile, entra nell'URL del mood e nei test. */
  key: string;
  /** Il titolo della fila, in italiano. */
  titolo: string;
  /** Generi TMDB (id dei film) in OR fra loro. `genreIdsFor` li traduce per le serie. */
  generi: number[];
  /** Generi da escludere: una domenica di pioggia non è un horror. */
  senzaGeneri?: number[];
  /** Keyword TMDB, opzionali e decorative (vedi sotto). */
  keyword?: number[];
  /** Minuti: "aperitivo" vuol dire anche "corto". */
  runtimeMax?: number;
  runtimeMin?: number;
  /** Vero solo per i momenti che non hanno senso per una serie. */
  soloFilm?: boolean;
}
```

### I dieci momenti, nell'ordine in cui vengono provati

Prima corrispondenza vince. La priorità è quella approvata: **meteo forte > fascia oraria
speciale > giorno > sera generica**.

| # | key | Condizione | Titolo | Generi (id film) |
|---|---|---|---|---|
| 1 | `domenica-pioggia` | domenica · pioggia/neve | Per una domenica di pioggia | 10751, 14, 35, 18 · senza 27, 53 |
| 2 | `pioggia-pomeriggio` | pioggia/neve · 12–18 | Fuori piove | 12, 14, 10751, 16 |
| 3 | `pioggia-sera` | pioggia/neve · 19–23 | Una sera di pioggia | 18, 9648, 14 |
| 4 | `notte-fonda` | 23–4 | Notte fonda | 27, 53, 9648 |
| 5 | `pausa-pranzo` | lun–ven · 12–14 | Pausa pranzo | 35, 99 · max 100 min |
| 6 | `aperitivo-venerdi` | venerdì · 17–20 | Aperitivo del venerdì | 35, 10749 · max 105 min |
| 7 | `mattina-weekend` | sab/dom · 8–12 | Mattina pigra | 16, 10751, 35 |
| 8 | `sabato-sera` | sabato · 20–23 | Sabato sera | 28, 12, 878, 14 |
| 9 | `sera-estate` | giu–ago · 20–23 · caldo/sereno | Sera d'estate | 12, 28, 35 |
| 10 | `freddo-inverno` | dic–feb · freddo | Freddo fuori | 18, 10749, 14 |
| — | `sera` | 19–23, tutto il resto | Film della sera | 18, 53, 80, 9648 |
| — | `sempre` | ripiego finale | Da vedere adesso | 18, 35, 28, 878 |

C'è **sempre** un vincitore: la fila non sparisce mai, e non c'è uno stato "home senza la
fila" da disegnare.

### I sei mood

Scelti a mano dall'utente, vincono su qualunque momento.

| key | Pillola | Titolo della fila | Generi |
|---|---|---|---|
| `leggero` | Leggero | Qualcosa di leggero | 35, 10751, 16 · senza 27, 53, 10752 · max 110 min |
| `triste` | Triste | Da piangerci sopra | 18, 10749 |
| `carico` | Carico | Carica adrenalina | 28, 53, 12 |
| `cuore-infranto` | Cuore infranto | Cuore infranto | 10749, 18 · keyword 34265 |
| `paura` | Paura | Voglia di paura | 27, 9648 |
| `cervello-acceso` | Cervello acceso | Cervello acceso | 878, 9648, 53 · keyword 362567 |

### Le keyword sono decorative, e questo è misurato

Le prime bozze delle ricette poggiavano sulle keyword TMDB ("cozy", "feel-good"). Non
reggono. Interrogato il 2026-09-08 con le soglie del motore (`vote_count ≥ 300`,
`vote_average ≥ 6`), `discover/movie` risponde:

| Filtro | Titoli |
|---|---|
| `with_keywords=326774` (`cozy`) | **0** |
| `with_keywords=275276` (`feelgood`) | **12** |
| `with_keywords=34265` (`heartbreak`) | **11** |
| `with_keywords=167541` (`buddy comedy`) | 36 |
| `with_keywords=6054` (`friendship`) | 313 |
| `with_genres=35,10749&with_runtime.lte=105` | 562 |
| `with_genres=35\|10751` | 3488 |

Una fila costruita su `cozy` sarebbe vuota. Quindi: **la spina dorsale di ogni ricetta
sono generi, durata e soglie di qualità**; le keyword sono un'aggiunta, e una ricetta che
le dichiara fa una seconda `discover` i cui risultati vanno **in testa** alla fila (sono
più a tema), con quelli dei generi a seguire. Se la query per keyword torna vuota non
succede niente di visibile.

Nota sulla grammatica di TMDB: nella `discover`, `,` fra i generi significa **e**, `|`
significa **o**. Le ricette vogliono `|`.

## 4. I titoli — `src/lib/moment/shelf.ts` (`server-only`)

```ts
export const getMomentShelf = cache(
  async (recipe: Recipe): Promise<ByTab<RankedItem[]>> => …
);
```

1. **Candidati**: una nuova `discoverForRecipe(type, recipe)` in `src/lib/tmdb/client.ts`
   — `with_genres` (in OR), `without_genres`, `with_keywords`, `with_runtime.lte/gte`,
   `vote_count.gte` e `vote_average.gte` con le stesse soglie del motore (film 300 / 6,0,
   serie 100 / 6,5), `with_type=2|4` per le serie, `sort_by=popularity.desc`,
   `revalidate: 3600`. La cache di Next è **condivisa fra tutti gli utenti**: un momento
   attivo costa una chiamata l'ora per tipo, non una per visita.
2. **Pulizia**: via i titoli già in libreria (`rankContext()`, che la home paga comunque),
   via quelli senza locandina.
3. **Ordine personale**: `affinity(vettore, c)` e `diversify()`, gli stessi della fase C.
   Il tema lo sceglie il contesto, l'ordine dentro il tema lo sceglie il gusto.
4. **Tre varianti** (`movie`, `tv`, `all` con `mixShelf`), 12 titoli ciascuna, perché la
   fila segue la pillola Film / Serie TV come tutti gli altri scaffali.

Un momento con `soloFilm` non produce la variante `tv`: sotto "Serie TV" la fila sparisce,
come già fanno le due sezioni cinema.

**Doppioni**: un titolo può comparire sia qui sia in "Per te". È raro (questa fila è
tematica, quella parte dai generi preferiti) e non vale un giro di esclusione fra due
`Suspense` diversi. Accettato consapevolmente.

## 5. La fila — `src/components/home/MomentShelf.tsx` (server)

Sopratitolo piccolo in `accent-soft` col contesto quando c'è qualcosa da dire
(`Adesso a Milano · piove`; la città è `user_locations.label`, mai le coordinate), poi il
titolo della ricetta, poi 12 copertine.

- `PosterCard` con **`rating` valorizzato**: l'affinità "per te N%" si disegna dentro la
  riga del voto, e uno scaffale che non passa `rating` non la mostra nemmeno se l'ha
  calcolata (trappola nota della fase C).
- `preview` acceso, così l'anteprima al passaggio del mouse funziona anche qui.
- Tutto dentro il proprio `Suspense`: il meteo non trattiene una riga di HTML del resto
  della home.

**Posizione**: subito sotto "Continua a guardare", prima delle sezioni cinema. È la prima
fila di consigli, ma non scavalca le cose che l'utente ha già iniziato.

## 6. Le pillole mood — `MoodPills.tsx` (client) + `/api/moment`

Riga sopra la fila: _Come ti senti?_ e sei pillole in vetro.

- Tocco → `GET /api/moment?mood=<key>` → la fila si riscrive sul posto, titolo compreso.
  Nessun ricarico, nessun ritorno al server per il resto della pagina.
- La risposta porta **tutte e tre le varianti** (`movie`, `tv`, `all`) in un colpo solo:
  altrimenti cambiare la pillola Film / Serie TV con un mood attivo costerebbe una
  seconda chiamata, e per un istante la fila resterebbe vuota.
- Secondo tocco sulla stessa pillola → torna il momento automatico.
- Le risposte restano in una `Map` per sessione (stesso schema di `PreviewLayer`): ogni
  mood costa **una** chiamata, anche se l'utente ci torna dieci volte.
- Il mood **non** si scrive da nessuna parte. Chiude l'app, torna il contesto. Un mood di
  stamattina che ricompare stasera sarebbe peggio di nessun mood.

Perché non rendere le sei varianti lato server come fa `HomeType`: sarebbero sei
`discover` per tipo a ogni visita per una riga che quasi nessuno tocca. Il costo va dove
c'è il tocco.

### La rotta è un endpoint HTTP come tutti gli altri

- `getViewer()`: senza sessione, 401.
- `mood` **validato contro l'elenco delle ricette** (`MOODS.find(...)`), mai interpolato
  in una query né in un URL; `type` contro `isMediaType`.
- Rate limit per utente dichiarato al punto di chiamata.
- Errori generici verso il client, dettaglio solo nei log.
- Nessuna coordinata nella risposta.

## 7. Come si collauda

**Vitest** (funzioni pure):

- `context.test.ts` — le fasce orarie e il fuso. Il caso che conta: 2026-06-21T21:40Z è
  **notte fonda** a Roma, non sera.
- `recipes.test.ts` — la priorità (domenica + pioggia + 21:00 dà `domenica-pioggia`, non
  `pioggia-sera` né `sera`), il ripiego che copre ogni combinazione possibile, e che ogni
  ricetta abbia titolo non vuoto e almeno un genere.
- `weather.test.ts` — i codici WMO, e che la pioggia batta la temperatura.

**Script**: `pnpm tsx --conditions=react-server scripts/moment-dump.ts [ora] [meteo]`
stampa il momento scelto e i primi titoli con ora e meteo **finti**: le dieci ricette si
guardano tutte in un minuto, senza aspettare che piova.

**Build vera** in cartella isolata (`NEXT_DIST_DIR=.next-check pnpm build`, poi
`next start`) e Playwright: la fila c'è, le pillole riscrivono, con il meteo spento la
home non cambia forma. Attenzione: quel build riscrive `tsconfig.json` (Next ci aggiunge
`.next-check/types`) — `git checkout -- tsconfig.json` prima di committare.

Infine `pnpm typecheck && pnpm lint && pnpm build`.

## 8. I file

**Nuovi**

```
src/lib/moment/context.ts        + context.test.ts
src/lib/moment/weather.ts        + weather.test.ts   (parte pura: codici WMO)
src/lib/moment/recipes.ts        + recipes.test.ts
src/lib/moment/shelf.ts
src/components/home/MomentShelf.tsx
src/components/home/MoodPills.tsx
src/app/api/moment/route.ts
scripts/moment-dump.ts
```

**Toccati**

```
src/lib/tmdb/client.ts       una discoverForRecipe
src/app/(app)/page.tsx       la fila, sotto ContinueRow
CLAUDE.md                    una sezione "Il momento giusto"
```

Nessuna migration. Nessun tipo da rigenerare.

## 9. Cosa resta fuori, di proposito

- **Festività** (Natale, Halloween): sono ricette in più nello stesso formato, si
  aggiungono quando le dieci di partenza si saranno dimostrate buone.
- **Il mood che pesa nel profilo di gusto**: un mood è uno stato d'animo di stasera, non
  un gusto. Non entra in `user_taste`.
- **Il mood come telemetria**: si potrebbe registrare quale mood viene scelto per tarare
  le ricette. Vale la pena, ma dopo — e passa dall'interruttore "Personalizza i consigli"
  come ogni altro evento.
- **La lista da 5 col numero nel titolo** ("5 film per una domenica di pioggia"): su
  desktop cinque copertine finiscono a metà schermo. La fila ne mostra 12 e il titolo non
  porta numeri.

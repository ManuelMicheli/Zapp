# Attori e registi preferiti

Come "Per genere" (`genres.md`) mette in mano all'utente il catalogo, questa
funzione gli mette in mano le persone: chi segue, l'app lo ricorda e lo mette a
peso nei consigli. Due pezzi: la pagina di una persona (testata, filmografia,
"quanto la conosci") e il preferito, che entra nel vettore di gusto della fase
C esattamente come un genere o un decennio (`algorithm.md`).

## `favorite_people`

Una riga per `(user_id, person_id)`: la chiave primaria stessa impedisce due
righe con ruolo diverso per la stessa persona. È voluto — una persona che
dirige e recita (Clint Eastwood, non a caso il primo caso provato) ha **un
ruolo solo** nei preferiti dell'utente, quello con cui l'ha messa lì la prima
volta. Non è un limite del modello: `title_people` (migration 0026) etichetta
comunque un titolo con `Regia:X` o `Cast:X` a seconda di cosa X ha fatto _in
quel titolo_, quindi un preferito "Cast:Clint Eastwood" continua a pesare sui
film dove ha solo recitato; smette di pesare su quelli dove ha solo diretto.
Sdoppiare la riga per coprire anche quel caso è stato scartato: la scheda
persona ha comunque un solo cuore, e due righe per la stessa faccia avrebbero
richiesto un secondo cuore da spiegare all'utente per un caso limite.

`name` e `profile_path` sono la copia di TMDB al momento del clic, non una
foreign key verso TMDB: lo scaffale del profilo (`FavoritePeopleShelf`) si
disegna con una riga di query, senza una chiamata TMDB per cerchio. Il prezzo
è che se una persona cambia foto su TMDB il preferito la mostra vecchia finché
non viene tolto e rimesso — accettato, è cosmetico.

## Nessuna cache Postgres delle persone

`getPerson`, `getPersonMovieCredits` e `getPersonTvCredits` (`src/lib/tmdb/client.ts`)
passano già dalla cache di `tmdbFetch`, un giorno di `revalidate`. Una tabella
`persons` con biografia e filmografia sarebbe un secondo posto in cui la
stessa informazione invecchia per conto suo — la trappola già vista con
`tmdb-cache.md` per i titoli, qui evitata da subito: la pagina persona (`src/app/(app)/person/[id]/page.tsx`)
legge sempre TMDB a caldo, e l'unica cosa che Zapp possiede davvero è la riga
di preferito.

## `filmografia()`: cosa entra e cosa no

`src/lib/people/filmography.ts` è una funzione pura (Vitest, `filmography.test.ts`)
apposta: le scelte discutibili — cosa si butta e in che ordine si mette il
resto — si provano con dati finti, non aprendo la pagina di Tom Hanks e
contando le locandine.

Butta via:

- i crediti **senza poster**. Una griglia con dentro dei rettangoli grigi
  vuoti sembra rotta, non "TMDB non ha ancora l'immagine"; meglio non
  mostrare il titolo che mostrarlo senza faccia.
- le **ospitate**, che TMDB accredita come se fossero ruoli: `character` che
  contiene `self` (anche il refuso `Selft`, che sta su un credito vero di
  Nolan: per questo la regex non ha il confine finale di parola), `himself`,
  `se stesso`, `archive footage`, `uncredited`. Chi si è fatto intervistare o
  compare in un filmato di repertorio non ha recitato.
- i **talk show, i notiziari, i reality e le premiazioni** (generi TMDB 10767,
  10763, 10764). Era il grosso del problema: un programma che va in onda ogni
  sera ha popolarità altissima, e la filmografia di Tom Hanks apriva con sette
  talk show e un cameo ai Simpson prima di Forrest Gump.
- i **documentari** (genere 99) **solo dal cast**: chi ci compare ci compare
  quasi sempre come se stesso, spesso senza che TMDB lo scriva nel personaggio.
  Chi li dirige resta in "Come regista".
- le serie in cui appare in **meno di due episodi**: è una comparsa da un
  episodio (Zendaya in Black-ish), non "la sua serie". Si perde qualche film
  per la TV accreditato come serie da un episodio solo — prezzo più basso di
  trenta comparsate.
- gli **extra**: zero voti e popolarità sotto 10 — "Avengers Endgame: Encore",
  "Onward: Magic Gems". Non sono titoli, sono contenuti bonus che TMDB
  accredita come film. La soglia di popolarità salva l'uscita fresca che i voti
  non li ha ancora presi.
- il porno (`adult`).
- come regista, solo `job === "Director"`: gli altri ruoli di crew (produttore,
  sceneggiatore, montatore) non sono "regia" per l'utente che clicca "Come
  regista", anche se TMDB li mette nello stesso array `crew`.
- i duplicati fra film e serie con lo stesso `id` numerico (spazi diversi di
  TMDB, la chiave di deduplica è `movie-123` vs `tv-123`, non `123`). TMDB
  manda davvero due righe per lo stesso show quando i personaggi sono due.
- oltre i primi 60 per notorietà: più di così è un elenco telefonico che
  nessuno scorre fino in fondo.

L'ordine è **dal più famoso al meno**, e famoso non vuol dire di moda:
`vote_count + popularity * 10`. Il numero di voti è l'unico segnale di fama
che TMDB dà gratis e non si muove col vento (No Way Home ne ha 23.000, un talk
show 215); `popularity` misura le visite di questa settimana, e da sola metteva
un'ospitata da Fallon davanti a Dune. Il peso 10 le lascia solo il compito di
non spedire in fondo un'uscita fresca senza voti (10 voti = 1 punto di
popolarità). A pari notorietà ordina l'`id`, così due render della stessa
pagina non scambiano di posto due titoli.

Il punteggio guida solo l'ordinamento e non arriva mai al chiamante — è
tolto all'ultimo passo apposta, per non far trapelare un numero interno di
TMDB in un tipo che la UI potrebbe un giorno decidere di mostrare.

Effetto misurato sui crediti veri (2026-09-14): Tom Hanks da 280 crediti di
cast a 60 (apre con Forrest Gump), Zendaya da 79 a 26 (apre con gli
Spider-Man), Nolan da 48 a 1 come interprete e 19 in regia.

## Il preferito nel vettore di gusto

`applicaPreferiti` (`src/lib/rank/vector.ts`) prende le chiavi `Cast:Nome` /
`Regia:Nome` di `getFavoriteKeys` (`src/lib/people/queries.ts`) e le forza a
1 nella dimensione `persone` del vettore — il massimo della scala, anche se i
dati dedotti dicevano il contrario: un preferito è l'utente che parla, non un
indizio statistico, e vince sempre. Aggiunge soltanto: le persone non
preferite restano dove le ha messe la fase A, perché dichiarare un amore non
è dichiarare i suoi opposti.

È applicata in **quattro punti**, tutti dietro `getFavoriteKeys` (mai
ricalcolata a mano):

- `rankFor` e `getRails` in `src/lib/rank/engine.ts` — "Per te" e i rail della
  home, incluso "Ancora con X";
- `getMomentShelf` in `src/lib/moment/shelf.ts` — il momento contestuale;
- `getPersonalContext` in `src/lib/similar/personal.ts` — il peso personale
  sopra ai "Simili", che restano impersonali in `title_similar`.

Il confronto con `title_people` (`appartiene()` in `src/lib/rank/rails.ts`,
la RPC in migration 0026) è per **nome esatto**, non per `person_id`: `raw`
dei titoli porta il nome scritto da TMDB nei crediti, non l'id della persona,
e la RPC che lo legge dentro Postgres restituisce stringhe. **Il legame fra
`favorite_people.role`/`name` e le etichette `Cast:`/`Regia:` di `title_people`
è quindi una convenzione di stringa fra due file che non si vedono**: cambiare
il formato delle etichette in uno dei due senza toccare l'altro spegne "Ancora
con X" in silenzio — nessun errore, il filtro semplicemente non trova più
corrispondenze.

`getFavoriteKeys` è avvolta in `cache()` di React: chiederla nei tre moduli
sopra nello stesso render costa una query sola, non tre. Per questo è
`server-only` e non può essere chiamata da un componente client — chi ne ha
bisogno lato client (`FavoritePersonButton`) passa dal server tramite props,
non dalla funzione. Anche `getFavoritePeople` è avvolta in `cache()`: sulla
scheda titolo `CastSection` la chiama direttamente, e i Simili la richiamano
dentro `getFavoriteKeys` — senza `cache()` sarebbero due select identiche per
pagina.

## Il tetto di 12

`MAX_PREFERITI` (`src/lib/people/queries.ts`) è controllato in
`togglePreferito` (`src/lib/people/actions.ts`), non da un vincolo del
database: un `check` direbbe "new row violates check constraint", un
messaggio tecnico che l'utente non deve mai vedere; la Server Action dice
invece "Hai già 12 preferiti: togline uno." Stessa logica delle altre
convalide del progetto (vedi `security.md`): il database resta l'ultima
difesa (migration 0055, lunghezze e domini), la UX sta nel codice applicativo.

## I quattro punti d'ingresso

- **La riga del cast** (`CastRow.tsx`, dentro `CastSection.tsx`): un cuore
  per riga, il ruolo salvato è sempre `Cast` — `TmdbCastMember` non porta
  `known_for_department`, e chiederlo a TMDB per ogni nome del cast non vale
  il costo. Un regista preferito da un suo cameo (Tarantino in _Pulp
  Fiction_, Eastwood...) viene quindi salvato come `Cast:Nome`; la pagina
  della persona, che il ruolo vero lo conosce, lo corregge da sola alla
  prima visita (`correggiRuoloPreferito` in `actions.ts`, tolta e rimessa la
  riga perché `favorite_people` non ha policy di `update`). Attenzione — qui
  il cuore è quello dell'**attore**; il _personaggio_ preferito della stessa
  scheda è
  `FavoriteCharacterSection`, un'altra funzione con un'altra tabella
  (`favorite_characters`, migration 0053): si somigliano nell'interfaccia (un
  cuore su un ritratto) ma non condividono nulla, e scambiarle nella lettura
  del codice è facile quanto scambiarle nella scrittura.
- **La riga "Regia" della scheda titolo** (`TitleAbout.tsx`): un link al nome,
  nessun cuore qui — porta alla pagina della persona, dove il cuore vive in
  `PersonHeader` con ruolo `Regia`.
- **La ricerca** (`SearchClient.tsx`, sezione persone): stesso principio, un
  link a `/person/[id]`, il cuore sta sulla pagina di destinazione.
- **Lo scaffale del profilo** (`FavoritePeopleShelf.tsx`, su `/profile` e su
  `/u/[username]`): non aggiunge preferiti, li mostra — cerchi con foto e
  nome presi dalla riga salvata, non da TMDB. Sul profilo altrui compare solo
  se la policy `favorite_people_select` lascia passare la riga (propri o
  amici, `security.md`); per un estraneo la lettura torna vuota e lo scaffale
  non si disegna, senza nessun controllo scritto qui apposta.

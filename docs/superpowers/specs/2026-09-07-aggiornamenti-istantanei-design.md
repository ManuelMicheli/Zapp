# Aggiornamenti istantanei in tutta l'app

Data: 2026-09-07
Stato: approvato (approccio A), da implementare

## Il problema

Quasi ogni azione dell'app cambia lo schermo solo **dopo** il giro sul server. Chi la usa
tocca "Rimuovi il biglietto" e resta a guardare la card di prima finché non arriva il
rendering nuovo; segna un film come visto e la libreria non se ne accorge.

Tre cause distinte, tutte verificate nel codice del 2026-09-07.

**1. Manca lo stato ottimistico.** Le Server Action sono 44 in dodici file, di cui una
trentina sono mutazioni, chiamate da 15 componenti client. Solo tre di quei componenti
applicano il cambiamento prima della risposta: `TitleActionsBar`
(`useOptimistic`), `FavoriteStar` e `ActivityLikeButton` (`useState` + ripristino a mano).
Tutti gli altri — `PlanCard`, `TicketSheet`, `TicketImport`, `ScanMode`, `PostShowCard`,
`LibraryGrid`, `RequestRow`, `FriendButton`, `ReviewsClient`, `RecommendSheet`,
`ProgressControls`, `EpisodeRow`, `RecommendationsSection`, `AvatarPicker`,
`ProfileEditor` — chiamano l'azione dentro `startTransition` e aspettano.

**2. Il ricalcolo è caro.** Ogni azione cinema fa `revalidatePath("/")` e ogni azione di
libreria ne fa quattro (`/`, `/library`, `/profile`, la scheda titolo). La risposta di una
Server Action porta con sé il rendering aggiornato della pagina corrente: sulla home
significa carosello, "Continua a guardare" (una `getTitleImages` e una `getSeason` per
tessera) e i due banner cinema (programma MyMovies). È tempo che oggi si vede tutto,
perché non c'è niente a coprirlo.

**3. Una lista che non si risincronizza.** `LibraryGrid` tiene gli item in
`useState(initialItems)`: React non riassegna lo stato iniziale quando il server manda
una lista nuova, quindi dopo un'azione la griglia resta identica finché non si naviga
altrove e si torna. Non è lentezza, è un aggiornamento che non arriva mai.

## Decisione

**Ottimismo locale, il server resta la verità.** Ogni componente applica subito il
risultato atteso; l'azione parte; il ricalcolo del server arriva dopo e sostituisce lo
stato ottimistico senza che si veda. In caso di errore lo stato torna indietro e compare
un toast.

Scartate:

- **Store globale delle mutazioni** (provider con le modifiche in sospeso, involucri
  client attorno alle liste rese dal server). Risolve l'aggiornamento di schermate che
  non stai guardando — problema che non abbiamo: due pagine non si vedono insieme e la
  router cache rirende quando ci si torna. Costo: un involucro per ogni lista e due
  verità da tenere allineate.
- **Cache client (SWR, React Query).** Le liste diventerebbero client. Contro le regole
  del progetto — Server Components per default, nessuna libreria UI — e riscrittura
  grossa per un guadagno che l'ottimismo locale già dà.

Il ricalcolo caro **resta com'è**: con lo stato ottimistico davanti non lo si vede più.
Toccare `revalidatePath` è un lavoro a sé, di prestazioni, non di reattività.

## L'helper condiviso

Nuovo modulo `src/lib/ui/optimistic.ts` (client). Raccoglie il giro che oggi è copiato a
mano in quindici file, in due varianti.

```ts
// Un valore che il server possiede e il client anticipa.
const { value, pending, run } = useOptimisticValue(serverValue);
run(prossimoValore, () => azioneServer(), { message?, undo? });
```

- `value` parte da `serverValue` (prop del Server Component) e torna a seguirlo appena la
  transizione finisce: nessun `useEffect` di risincronizzazione da scrivere a mano, che è
  il punto in cui oggi le implementazioni divergono.
- `run` applica il valore ottimistico, chiama l'azione dentro `startTransition`, e se la
  risposta non è `ok` mostra il toast (`r.error` se c'è, altrimenti "Qualcosa è andato
  storto. Riprova.") e lascia tornare il valore del server.
- `message` è il toast di conferma; `undo` la richiamata per l'annulla, che oggi esiste
  in `TitleActionsBar`, `LibraryGrid`, `ProgressControls` ed `EpisodeRow` con
  `restoreEntry`.
- `pending` per l'opacità e per ignorare il doppio tocco.

```ts
// Una lista che il server possiede e da cui il client toglie o aggiunge righe.
const { items, pending, run } = useOptimisticList(serverItems, keyOf);
run({ remove: key }, () => azioneServer(), { message?, undo? });
```

Costruita sopra `useOptimistic`. Serve dove l'elemento deve sparire subito: griglia
libreria, consigli in home, richieste di amicizia, recensioni.

Regole del modulo: nessuna dipendenza dai domini (cinema, watch, social) — prende
un'azione che ritorna `{ ok, error? }` e basta; nessun `router.refresh()` dentro, chi lo
vuole lo chiama nella richiamata.

## Regola per le liste: la base viene dal server

`LibraryGrid` oggi mescola due cose nello stesso stato: la prima pagina, che è del
server, e le pagine successive, che sono del client. Si separano:

```
items = [...initialItems, ...paginePiùAvanti]
```

`initialItems` resta una prop e comanda; `paginePiùAvanti` è lo stato di `loadMore`. Così
il rendering nuovo del server entra da solo e la paginazione sopravvive. Sopra a questo,
`useOptimisticList` per le rimozioni.

Stessa regola ovunque una lista del server sia stata copiata in `useState`:
`RecommendationsSection` (`visible`), `ReviewsClient` (commenti).

## Flusso per flusso

Cosa deve cambiare **prima** della risposta del server.

### Cinema

| Componente | Azione | Effetto immediato |
| --- | --- | --- |
| `PlanCard` | `removeTicket` | Spariscono "Biglietto" e "Sono qui", torna "Biglietti" + "Aggiungi il biglietto" |
| `PlanCard` | `cancelPlan` | Il banner della serata sparisce dalla home |
| `PlanCard` | `movePlan` | Orario, formato e conto alla rovescia passano al nuovo spettacolo |
| `TicketSheet` | `planShowing` | Il tagliando passa a "Serata salvata" senza attesa (oggi `saved` si scrive dopo) |
| `TicketSheet` | `cancelPlan` | Torna "Ci vado" |
| `TicketImport` | `attachTicket` | Il biglietto compare appena la decodifica finisce, prima della scrittura |
| `ScanMode` | `setSeats` | I posti scritti a mano compaiono nell'ultima schermata |
| `PostShowCard` | `markWatched`, `setRating`, `cancelPlan` | Passa al passo del voto e poi sparisce senza aspettare |
| `FavoriteStar` | `toggleFavoriteCinema` | Già ottimistico: passa all'helper, comportamento invariato |

### Libreria e scheda titolo

| Componente | Azione | Effetto immediato |
| --- | --- | --- |
| `LibraryGrid` | `addWant`, `startWatching`, `markWatched`, `dropTitle`, `removeEntry` | La card lascia la scheda corrente; l'annulla la rimette |
| `TitleActionsBar` | tutte | Già ottimistico: passa all'helper, comportamento invariato |
| `ProgressControls` | `setProgress` | Numero, titolo e barra dell'episodio passano al punto nuovo |
| `EpisodeRow` | `setProgress` | La spunta dell'episodio cambia subito |
| `RecommendationsSection` | `addWant` | Il consiglio esce dalla fila |

### Social e profilo

| Componente | Azione | Effetto immediato |
| --- | --- | --- |
| `RequestRow` | `acceptFriendRequest`, `declineFriendRequest` | La riga passa allo stato finale (oggi solo dopo la risposta) |
| `FriendButton` | `sendFriendRequest`, `acceptFriendRequest`, `removeFriend`, `blockUser` | Il bottone cambia stato subito |
| `ReviewsClient` | `upsertReview`, `addComment`, `toggleReviewLike`, `setRating` | La recensione e il commento compaiono; il cuore è già ottimistico |
| `RecommendSheet` | `recommendTitle` | Il destinatario passa a "inviato" |
| `AvatarPicker` | `saveAvatarPreset` | L'avatar cambia nell'anteprima e nella testata |
| `ProfileEditor` | `updateProfile`, `setProfilePrivacy` | L'interruttore si muove subito |

## L'import riempie la libreria mentre gira

`ImportProvider` oggi chiama `router.refresh()` una volta sola, a fine import (riga 210).
Passa a chiamarlo **alla fine di ogni blocco confermato** (25 titoli, `CONFIRM_CHUNK_SIZE`):
se sei in libreria la vedi crescere di un blocco alla volta, se sei in home le file si
riempiono.

Il costo è accettabile perché la libreria è una query sul DB e non tocca TMDB. Due
guardie:

- **Mai due refresh sovrapposti**: se il precedente non è finito, quello nuovo si salta
  (l'ultimo blocco arriva comunque).
- **Non più di uno ogni 2 secondi**, così un import da 6000 righe non fa una raffica di
  rendering.

`ImportChip` resta com'è: la barra "Riconoscimento n/N" e "Importazione n/N" già si
aggiorna da sola.

## Errori, annulla, doppio tocco

- **Errore**: lo stato ottimistico cade, torna quello del server, toast con il messaggio
  dell'azione se c'è. Nessuna schermata di errore, nessun blocco.
- **Annulla**: invariato dove esiste già (`restoreEntry`, `PlanUndo`); l'undo passa per lo
  stesso `run`, quindi anche il ripristino si vede subito.
- **Doppio tocco**: `pending` disabilita il comando, come fa già `FavoriteStar`.
- **Azione lenta oltre la transizione**: lo stato ottimistico regge finché la transizione
  è aperta, e la risposta della Server Action porta il rendering nuovo della pagina
  corrente — quindi il salto indietro non capita. Dove l'azione **non** rirende la pagina
  corrente (`toggleFavoriteCinema`, che rivalida `/cinema` da una scheda titolo) si tiene
  lo stato locale come oggi.

## Fuori perimetro

- Ridurre il costo di `revalidatePath` (lavoro di prestazioni, a sé).
- Aggiornare schermate diverse da quella aperta.
- Sostituire i toast o l'annulla esistenti.
- `loadMoreLibrary`, `getPlanAlternatives`, `fetchFeedPage`, `searchUsers`: sono letture,
  non mutazioni; restano com'è.

## Verifica

- **Vitest** su `src/lib/ui/optimistic.ts` per la parte pura (riduttori della lista:
  rimozione per chiave, sostituzione, ripristino). I componenti non hanno test oggi e non
  se ne introducono.
- `pnpm typecheck && pnpm lint && pnpm build` — build in una cartella a parte
  (`NEXT_DIST_DIR`) perché il tree è condiviso con altre sessioni.
- **Prova nell'app** dei flussi che l'utente ha nominato: rimuovere il biglietto, import
  in corso con la libreria aperta, aggiungere un film a "Da vedere". Il criterio è uno
  solo: fra il tocco e il cambiamento sullo schermo non si aspetta il server.

# Le chicche (citazioni fra film e serie)

Dentro **"Voti e recensioni"**, in fondo all'elenco, una recensione firmata da un
personaggio che — in un'altra opera — parla proprio di quel film: avatar
dell'interprete, voto, corpo, la stessa forma di `ReviewCard`. **Nessuna etichetta
e nessuna icona la marcano** (scelta utente 2026-09-08: "deve essere una recensione
normale"); sotto c'è solo il titolo dell'opera con stagione ed episodio
("The Big Bang Theory · S7E4"), che è il link alla sua pagina — alla stagione se la
conosciamo, perché le schede per singolo episodio non esistono. Titolo senza
chicche → il componente non rende niente e l'elenco è quello di sempre.

- `TitleTrivia` rende una `<article>` nuda: il contenitore è `ReviewsClient`, che la
  riceve come prop `trivia` (nodo server passato a un client component) e la mette
  in coda alle recensioni vere. Con zero recensioni vere e una chicca, il messaggio
  "Nessuna recensione" non compare. Stava in fondo alla pagina fino al 2026-09-08,
  poi l'utente l'ha voluta qui.
- Dati statici a mano in `src/lib/easter-eggs/data.ts` (nessuna tabella, nessuna
  migration). Quattro regole per entrare:
  1. **La battuta è vera**: `quote` è verificata su una fonte (script, IMDb, wiki
     della serie) e tradotta in italiano. Niente aneddoti "si dice che".
  2. **Il resto è in voce del personaggio**: `review` lo scriviamo noi attorno alla
     battuta e **deve contenerla parola per parola** (test). In pagina il corpo è
     **tutto dello stesso bianco** (`text-white/90`, richiesta utente 2026-09-08):
     una recensione normale non ha frasi evidenziate, e il grassetto sulla battuta
     vera la faceva leggere come una citazione riportata.
  3. **Il voto torna col testo**: `rating` è quello che darebbe quel personaggio
     (Fantozzi 1 alla Corazzata, Cartman 10 alla Passione), ma deve reggere la
     rilettura — chi scrive "resta un film godibile" non può dare 4, e Randal, che
     in Clerks difende Il ritorno dello Jedi, fa un'obiezione morale dentro un voto
     alto, non una stroncatura. Nessun test può controllarlo: si rilegge a mano.
  4. **Devono essere note in Italia entrambe le opere**, quella citata e quella che
     cita: una chicca sotto un titolo che nessuno apre non la vede nessuno, e una
     firmata da una serie mai arrivata qui non fa ridere. Per questo sono state
     scartate Spaced, Seinfeld, Flash Gordon e MacGyver, che pure avevano la
     battuta giusta e verificata.
- `find.ts` è puro e testato: `chiccaFor`, `splitAroundQuote` (isola la battuta
  dentro la recensione), `sourceLabel` / `sourceHref` (etichetta e link della
  fonte). I test controllano anche l'elenco: un solo record per titolo, nessun
  titolo che cita se stesso, ogni recensione contiene la sua battuta, voto 1–10.
  La fonte porta `season`/`episode`/`episodeTitle` **strutturati**, non una stringa
  già formattata: serve a costruire il link alla stagione.
- La faccia dell'avatar è l'interprete: `speaker.personId` → `getPerson(id)`
  (`person/{id}`, cache 30 g), **una sola chiamata TMDB e solo quando la chicca
  esiste**. Personaggi animati (Willie, Cartman) hanno `personId: null` e scendono
  sull'iniziale.


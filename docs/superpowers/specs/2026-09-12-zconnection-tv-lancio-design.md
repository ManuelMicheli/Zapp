# ZConnection su TV — Piano 2: lanciare un titolo da Zapp

**Obiettivo.** Dalla scheda di un titolo in Zapp, farlo partire sulla TV. E usare
quel lancio per dare un nome alle sessioni che Netflix, Prime Video e l'app Apple
TV pubblicano **senza titolo**, cosi' che anche loro finiscano in libreria col
minutaggio che scorre, come gia' fanno NOW e Disney+.

Il Piano 1 (abbinamento e ascolto) sta in
`docs/superpowers/plans/2026-09-12-zconnection-tv-abbinamento.md`, collaudato sulla
Fire TV il 12/09. Le forme di lancio sono gia' misurate:
`docs/zconnection/FIRETV-SONDA-2026-09-12.md` §3.

## Perche' funziona: cosa manca davvero

Netflix, Prime e Apple TV pubblicano **stato e posizione perfetti e nessuna
identita'** — verificato di nuovo il 12/09 sul sistema vivo, non solo dalla sonda:

```
Netflix    state=3 (playing) position=535484   metadata:size=0  queueTitle=null
Disney+    state=2 (paused)  position=2799681  metadata:size=3  description=Doctor Who
Spotify    state=0           position=35679    metadata:size=12 description=Uragano, Tony Boy
```

Non e' protezione: la posizione sta in `PlaybackState`, che serve ai tasti del
telecomando e ad Alexa, quindi e' obbligatoria; il titolo sta nei `MediaMetadata`,
che servono a disegnare la notifica del player — e su una TV quella notifica non
esiste. Spotify li riempie perche' e' la stessa app del telefono.

**Manca solo il nome.** Se lo dichiara Zapp lanciando il titolo, tutto il resto
della catena esiste gia'.

## Decisioni prese

| Domanda | Scelta |
| --- | --- |
| Cosa scrive il lancio in libreria | **Niente**, finche' non arriva una riproduzione vera oltre i due minuti. Il lancio *dichiara*, non registra. |
| Piattaforme che non avviano il titolo | Il tasto c'e' lo stesso e **dice cosa fara' davvero**: "Parte sulla TV" / "Apro la scheda, premi Play" / "Apro NOW". |
| Quanto vale una dichiarazione | Per la sessione nata dal lancio, piu' una ripresa entro ~30 minuti da una posizione uguale o piu' avanti. |
| Dove sta il tasto | Scheda titolo e tessera di "Continua a guardare". |
| Come arriva il comando alla TV | Coda in tabella piu' sondaggio ogni 5 s. |

## Le forme di lancio (misurate, non dedotte)

| Piattaforma | Forma | Esito |
| --- | --- | --- |
| Netflix | component `com.netflix.ninja/.MainActivity`, `VIEW`, extra `amzn_deeplink_data` = id Netflix | **avvia il titolo** |
| Disney+ | `https://www.disneyplus.com/play/<uuid>` | **avvia il titolo** |
| Prime Video | `https://app.primevideo.com/detail?gti=<gti>` | apre la **scheda** |
| Apple TV | `https://tv.apple.com/it/<tipo>/<slug>/<umc...>` | apre la **scheda** |
| NOW | `AmazonMainActivity` piu' `amzn_deeplink_data` | apre la **home** |

Gli id stanno gia' in `title_provider_links` (fonte `justwatch`). Tre trappole che
costano tempo se non si sanno, tutte dalla sonda §3: per Netflix **l'URL non
basta** (avvia solo l'extra); per Disney+ `play/<uuid>` avvia e
`browse/entity-<uuid>` no, con lo stesso uuid; **il componente va sempre
indicato**, altrimenti Android mostra il selettore "apri con".

## Dati

Una tabella sola, `device_commands`: la riga **e'** il lancio, e dopo la consegna
**e'** la dichiarazione. Una seconda tabella direbbe le stesse cose due volte.

```
device_commands
  id             uuid pk
  device_id      uuid not null references devices(id) on delete cascade   -- + indice
  created_by     uuid not null references profiles(id) on delete cascade  -- + indice
  title_id       bigint     not null
  media_type     media_type not null
  provider_id    int        not null
  -- come aprirlo: lo decide il server, la TV esegue
  package        text       not null
  data_uri       text
  extra_deeplink text
  created_at     timestamptz not null default now()
  expires_at     timestamptz not null          -- created_at piu' 2 minuti
  delivered_at   timestamptz                   -- quando la TV l'ha ritirato
  result         text                          -- ok | assente | errore, dalla TV
  -- stato della dichiarazione, aggiornato a ogni evento attribuito
  last_position_ms bigint
  last_seen_at     timestamptz
```

**La forma di lancio la decide il server.** La TV riceve `package`, `data_uri` ed
`extra_deeplink` e li esegue senza sapere cosa siano: se domani Netflix cambia
forma si corregge in Zapp e le TV gia' installate obbediscono, senza aggiornare
l'app. E' la stessa ragione per cui l'estensione browser e' muta.

**RLS**: `to authenticated`, con `(select auth.uid())` dentro le policy. Si legge e
si scrive solo per una TV di cui si e' membro (`device_members`), e **il controllo
di proprieta' si rifa' nel codice**, non solo nella policy. La TV non passa da RLS:
si autentica col token, come per lo scrobble.

## Il giro del comando

1. **Dal telefono**: Server Action in `src/lib/devices/actions.ts`. Verifica la
   membership, risolve la forma da `title_provider_links`, scrive la riga, e
   risponde dicendo **cosa succedera'** ("parte", "apre la scheda", "apre l'app"),
   perche' e' il server a sapere quale forma ha in mano.
2. **Dalla TV**: `GET /api/devices/commands` col Bearer del dispositivo, ogni 5 s.
   Restituisce **al massimo un comando** e lo segna consegnato nello stesso
   momento. Consegna al massimo una volta: per "fai partire un film", non partire
   e' meglio che partire due volte.
3. **L'esito torna indietro**: al sondaggio successivo la TV dice com'e' andata
   (`ok`, `assente` se l'app non e' installata, `errore`). Senza, un lancio fallito
   sarebbe muto — e il 12/09 abbiamo gia' pagato due guasti muti.
4. **Scadenza a due minuti.** Se la TV era spenta e si accende un'ora dopo, non
   deve mettersi a riprodurre un film da sola.

**Il costo, scritto perche' non sia una sorpresa**: 12 richieste al minuto per ogni
TV accesa. Con poche TV e' nulla; **oltre un centinaio di TV accese insieme** (~20
richieste al secondo di solo sondaggio) conviene passare a Supabase Realtime, che
oggi non si prende perche' il progetto non lo usa da nessuna parte e l'app TV non
ha **nessuna dipendenza**: servirebbe un client websocket col protocollo Phoenix
scritto a mano, oppure `okhttp` — e la scelta "zero dipendenze" esiste apposta per
non dover mai aspettare la review di uno store per un aggiornamento. Va in
`scale.md`.

## Dal lancio all'identita'

Quando arriva un evento **senza titolo** da una TV per una piattaforma, si cerca
l'ultima riga consegnata per quella coppia (dispositivo, piattaforma) e si
applicano tre controlli, in una funzione **pura** con i suoi test
(`src/lib/scrobble/declared.ts`), accanto a `riproduzioneVera` e
`risolviEpisodioNow`:

1. **E' la sessione nata dal lancio?** Se non si e' ancora attribuito niente:
   si', purche' dalla consegna siano passati meno di 30 minuti. Lanci e poi vai a
   cena: la dichiarazione e' scaduta e l'evento resta anonimo.
2. **E' la stessa visione?** Se si e' gia' attribuito, si accetta finche' l'ultimo
   evento attribuito e' di meno di 30 minuti fa.
3. **La posizione ha senso?** Si accetta se non e' tornata quasi a zero. Un
   riavvolgimento di qualche minuto e' normale; **se eri a un'ora e ricompari a
   trenta secondi hai cambiato titolo**, e la dichiarazione muore li' invece di
   scrivere il resto della serata sul film sbagliato.

Un lancio nuovo sulla stessa coppia (dispositivo, piattaforma) sostituisce il
precedente.

Il resto della pipeline resta com'e': **la soglia dei due minuti vale anche qui**
(Netflix e Prime creano una sessione anche solo sfogliando), e per una serie di cui
non si conosce l'episodio valgono i divieti del Piano 1 — si registra la serie, non
si completa mai.

## Quando un titolo e' finito

La durata dello stream non c'e'. Ma il titolo lo conosciamo, perche' l'abbiamo
lanciato noi: il denominatore lo da' **TMDB**, e le soglie restano quelle di sempre
(`COMPLETE_RATIO` 0,9 mentre scorre, `CLOSE_RATIO` 0,85 alla chiusura).

Il margine e' stato misurato sui due casi veri del 12/09, dove la durata vera c'era
e si e' potuta confrontare:

| Titolo | Stream dalla TV | Runtime TMDB | Scarto |
| --- | --- | --- | --- |
| Maze Runner — La fuga | 133,3 min | 132 min | piu' 1,3 min |
| Atomic S1E1 | 46,2 min | 46 min | piu' 0,2 min |

Lo stream e' appena piu' lungo (sigle e titoli di coda). Il 90% del runtime TMDB
cade all'**89% dello stream reale**: dentro il margine, con spazio da vendere.

Due segnali in piu', gratis, che le altre piattaforme non danno: la sessione che si
chiude vicino alla fine, e — per le serie — **la posizione che torna a zero** quando
Netflix avvia da solo l'episodio successivo. Lo stesso salto che nella regola 3 dice
"hai cambiato titolo" qui dice anche "il precedente e' finito".

## Cosa si vede

- **Il tondo TV** accanto ai tasti della scheda titolo e sulla tessera di "Continua
  a guardare", **solo** se c'e' almeno una TV collegata e non revocata.
- **Con piu' TV**, un foglio con l'elenco e il nome di ciascuna; con una sola, un
  tocco.
- **Il testo dice la verita' per piattaforma**: "Parte sulla TV" / "Apro la scheda,
  poi premi Play" / "Apro NOW".
- **Il ritorno**: per una ventina di secondi la pagina chiede se il comando e' stato
  ritirato, e il tondo passa da "Apro su AFTMM…" ad "Aperto". Se nessuno lo ritira:
  "La TV non ha risposto — e' accesa?". Se la TV risponde `assente`: "Su quella TV
  Prime Video non e' installata". Un fallimento detto a voce, mai un tondo che gira
  per sempre.
- **Senza id per quella piattaforma** in `title_provider_links` il tondo **non
  compare**: meglio assente che presente e inerte.

## Sicurezza

- Tetto di frequenza sul lancio, per utente, come per le altre azioni.
- La riga non contiene niente di sensibile: id TMDB, id piattaforma, forma di
  lancio.
- `data_uri` ed `extra_deeplink` li **compone il server** da `title_provider_links`:
  non arrivano dal client. E' la superficie piu' delicata del piano, perche' e' un
  intent che un'altra macchina eseguira'.
- Il `package` si prende da una **lista chiusa** (gli stessi pacchetti che la sonda
  gia' riconosce), mai da un campo libero.

## Cosa questo piano NON fa

Mettere in pausa o fermare la TV da Zapp; lanciare sulla TV di qualcun altro; il
telefono Android come sonda per Netflix e Prime — filo aperto, da verificare con
una misura prima di progettarlo.

## Collaudo

Funzioni pure con test: le tre regole di validita' della dichiarazione, la scelta
della forma di lancio, il completamento col runtime TMDB.

Il resto sulla Fire TV vera, come il Piano 1: lanciare un film su Netflix dal
telefono e vederlo partire; dopo due minuti trovarlo in libreria col minutaggio che
scorre; lanciare su Prime e trovarsi sulla scheda; cambiare titolo col telecomando e
vedere la dichiarazione **cadere** invece di scrivere il falso; spegnere la TV,
lanciare, riaccenderla dopo cinque minuti e **non** vedere partire niente.

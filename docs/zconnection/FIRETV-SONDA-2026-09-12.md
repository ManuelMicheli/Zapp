# Fire TV — sonda del 12 settembre 2026

Eseguita su hardware vero: **Fire TV Stick 4K** (`AFTMM`, Fire OS 6.7.1.1,
Android 7.1.2 / API 25), adb via rete. Chiude la **fase 0** della spec
`docs/superpowers/specs/2026-09-04-zconnection-design.md` (§14): la premessa di
quella spec — le app pubblicano i metadati al sistema — **vale per meta' delle
piattaforme**, non per tutte, e il permesso che serve per leggerle non ha
interfaccia su Fire OS.

## 1. I metadati: dipende dall'app, una per una

**Meta' delle piattaforme pubblica il titolo, meta' no.** Non c'e' una regola di
Fire OS: e' una scelta di ciascuna app. (Durante la sonda avevo dedotto il
contrario da due casi negativi, con una spiegazione strutturale — niente tendina
notifiche sulle TV, quindi nessun obbligo — che i due casi successivi hanno
smentito. Vale per il metodo: due campioni non sono una regola.)

| App | `MediaSession` | Cosa espone |
| --- | --- | --- |
| **NOW** (`com.nowtv.it`) | si' | `TITLE`, `DISPLAY_TITLE`, **`DURATION`**, `DATE` (messa in onda) |
| **Disney+** (`com.disney.disneyplus`) | si' | `TITLE`, **`DURATION`** |
| Netflix (`com.netflix.ninja`) | si' | **niente**: `metadata:size=0` |
| Prime Video (`com.amazon.firebat`) | si' | **niente**: `metadata:size=0` |
| App Apple TV (`com.apple.atve.amazon.appletv`) | si' | **niente**: `metadata=null` |

Esempi reali catturati:

```
[com.nowtv.it]           TITLE=Al Britani | DURATION=2772000 | DATE=2026-08-20T04:02:00.000Z
[com.disney.disneyplus]  TITLE=Big Hero 6 | DURATION=6557000
[com.netflix.ninja]      metadata:size=0, description=null
[com.apple.atve...]      metadata: null   (film noleggiato in riproduzione)
```

Due su cinque bastano a se stesse; tre no. Non c'e' correlazione con la dimensione
dell'editore ne' con il fatto di essere un'app Amazon: Prime Video, che e' di
Amazon, e' fra quelle mute.

Conseguenza: **NOW e Disney+ si seguono da sole**, in modo passivo, esattamente come
nel browser — titolo e durata bastano al riconoscimento TMDB gia' scritto
(`src/lib/scrobble/`). NOW da' il nome dell'**episodio** (non della serie, ne' i
numeri di stagione): e' il caso che `providers/declared-episode.ts` e la
risoluzione per nome gia' trattano.

Netflix, Prime Video e l'app Apple TV danno **stato e posizione perfetti ma nessuna
identita'**, e nemmeno la durata, che serviva a decidere "finito". Per loro vale
la §3.

Un caso da tenere a mente: Disney+ **non crea nessuna sessione mentre si sfoglia**
(compare solo con la riproduzione), Netflix e Prime si' — vedi la trappola delle
anteprime in §4.

## 2. Cosa Fire OS non concede a nessuno

### Permesso notifiche: nessuna interfaccia

`ACTION_NOTIFICATION_LISTENER_SETTINGS` solleva `ActivityNotFoundException`: la
schermata non esiste. L'unico `NotificationListenerService` sul dispositivo e' di
Amazon (`com.amazon.ftv.xpicker`) e i permessi relativi sono `signature|amazon`.

Si concede solo da adb, e **`cmd notification allow_listener` non esiste su API 25**:

```
settings put secure enabled_notification_listeners com.pkg/com.pkg.Listener
```

### Accessibilita': rimossa per le terze parti

Era la strada equivalente a quella che l'estensione browser usa sul DOM. Non
esiste su Fire OS:

```
SystemServiceManager: Starting com.amazon.android.server.accessibility.AmazonAccessibilityManagerService
```

Amazon sostituisce il servizio di sistema. Il suo `dumpsys accessibility` non
elenca **nessun** servizio installato (Android standard li elenca tutti) e non ne
aggancia mai uno. Verificato fino in fondo: servizio registrato correttamente nel
package manager, valore scritto a forza (`settings put` lo scarta in silenzio,
`content insert --uri content://settings/secure` passa), `accessibility_enabled=1`,
riavvio completo. Sempre `services:{}`. La schermata Impostazioni → Accessibilita'
esiste ma e' protetta da `com.amazon.tv.permission.LAUNCHER_SETTINGS`
(`signature|amazon`), quindi un'app non puo' nemmeno aprirla.

### Provider "Continua a guardare": chiuso

- `amazon.media.tv` (`FireTvProvider`), quello che alimenta la home di Fire TV,
  richiede `com.amazon.providers.tv.permission.READ_EPG_DATA`, **`signature|amazon`**.
- Il provider Android standard `content://android.media.tv` **c'e'** e il suo
  `READ_EPG_DATA` e' **`prot=normal`** (richiedibile da chiunque, senza prompt), ma
  su Fire OS e' **vuoto**: le app scrivono su quello di Amazon.

Indizio per un'altra strada, da verificare: **Disney+ dichiara `WRITE_EPG_DATA`**.
Su Google TV / Android TV quel provider sarebbe vivo e conterrebbe titolo, episodio
e `last_playback_position_millis`. Servirebbe una sonda su quell'hardware.

### Notifiche

Netflix pubblica solo `category=recommendation` (le righe della home Fire TV),
mai una notifica di riproduzione. `contentView=null`.

## 3. Quando il titolo non c'e': lo dichiara Zapp

Ribalta il problema. Non indovinare cosa guarda l'utente: **saperlo perche' e' Zapp
ad aprirglielo**. Verificato dal vivo su Arcane, Breaking Bad, Batman Begins e
Big Hero 6.

| Piattaforma | Forma che funziona | Esito |
| --- | --- | --- |
| Netflix | component `com.netflix.ninja/.MainActivity`, `VIEW`, extra **`amzn_deeplink_data`** = id Netflix, `FLAG_ACTIVITY_NEW_TASK` | **avvia il titolo** |
| Disney+ | `https://www.disneyplus.com/play/<uuid>` | **avvia il titolo** |
| Prime Video | `https://app.primevideo.com/detail?gti=<gti>` | apre la **scheda**: un tasto all'utente |
| App Apple TV | `https://tv.apple.com/it/<tipo>/<slug>/<umc.cmc...>` | apre la **scheda** |
| NOW | `AmazonMainActivity` + `amzn_deeplink_data` = id asset | apre la **home**: non centra il titolo (ma NOW non ne ha bisogno, §1) |

Gli id sono **gia' in `title_provider_links`** (fonte `justwatch`):
`netflix.com/title/<id>`, `disneyplus.com/browse/entity-<uuid>` (stesso uuid di
`/play/`), `app.primevideo.com/detail?gti=...`.

Dettagli che costano tempo se non si sanno:

- **Per Netflix l'URL non basta.** `https://www.netflix.com/watch/<id>`,
  `netflix://title/<id>` e `nflx://` aprono l'app e si fermano alla home. Avvia
  solo l'extra `amzn_deeplink_data`.
- **Per Disney+ conta il percorso.** `browse/entity-<uuid>` apre la scheda,
  `play/<uuid>` avvia. Stesso uuid.
- **Funziona anche a caldo.** Con Netflix gia' aperta il titolo cambia all'istante
  (`onNewIntent`) **nonostante** `am` stampi "Activity not started, its current task
  has been brought to the front": l'avviso mente, l'intent viene consegnato. E'
  decisivo, perche' un'app non puo' chiuderne un'altra.
- **Il componente va indicato sempre.** Con il solo URL compare il selettore "apri
  con" di Android (piu' app dichiarano `app.primevideo.com`).
- A freddo il selettore profili si mangia il deep link **nella forma URL**; con
  l'extra il titolo parte dopo la scelta del profilo.

## 4. Due trappole per chi implementa

**Una `MediaSession` attiva non vuol dire che si stia guardando.** Netflix e Prime
riproducono le **anteprime** del catalogo e del selettore profili come sessioni vere:
`state=PLAYING`, posizione che avanza da zero, indistinguibile da un film. Ci sono
cascato due volte durante questa sonda, dichiarando "parte" cio' che era solo
un'anteprima. Senza titolo ne' durata l'unica difesa e' il comportamento (le
anteprime sono corte e ripartono in loop): **niente scrittura in libreria prima di
un paio di minuti continui**. Su Disney+ il problema non si pone: la scheda non crea
nessuna sessione.

**Il ritmo degli aggiornamenti cambia per app.** Netflix notifica la posizione ogni
~2 s; **Prime solo ai cambi di stato**. Il minutaggio live non si puo' aspettare
dalle callback: va estrapolato da `position` + `updateTime` + `speed`, come fa gia'
il popup dell'estensione nel browser.

## 5. Conseguenze sul disegno

- **Film: identita' completa.** Serie: la **serie** e' certa, l'**episodio** no — il
  link e' quello della serie e l'episodio lo sceglie la piattaforma. Si deduce dal
  ritorno a zero della posizione piu' la lista episodi TMDB.
- **La durata arriva da TMDB**, proprio perche' il titolo lo conosciamo: e' cosi' che
  si decide "finito", visto che la `MediaSession` non la espone.
- **Copre cio' che parte da Zapp.** Chi apre Netflix col telecomando resta una
  sessione senza nome: per quella vale "Da confermare" (spec §9.2), una volta per
  serie e non per episodio.

## 6. Ambiente

Fire TV a `192.168.1.12:5555` (`192.168.1.1` e' il router), adb in
`%LOCALAPPDATA%\Android\Sdk\platform-tools`. Lo stick **stacca l'adb** in standby e
durante la riproduzione a schermo intero: va risvegliato col telecomando e
riconnesso. Sonda in `D:\PROGETTI\ZConnection` (`ProbeListener`, `SessionProbe`,
`ProbeAccessibility`); toolchain e vincolo TLS di AVG nella memoria di progetto.

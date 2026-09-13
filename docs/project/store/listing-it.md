# Scheda per gli store — Google Play e App Store (italiano)

Fonti: `docs/architecture/legal.md`, `docs/legal/registro-trattamenti.md`,
`docs/legal/moderazione.md`, `docs/architecture/mobile.md`, le pagine
`src/app/(legal)/privacy/page.tsx` e `src/app/(legal)/termini/page.tsx`. Ogni
affermazione sui dati o sulle funzioni qui sotto viene da uno di questi file o dal
codice che cita.

## Nome

**Zapp**

## Sottotitolo (App Store, campo "Subtitle", ≤ 30 caratteri)

Film e serie, dove guardarli
<!-- 28 caratteri -->

## Descrizione breve (Google Play, campo "Short description", ≤ 80 caratteri) -->

Traccia film e serie, scopri dove guardarli in streaming o al cinema in Italia
<!-- 79 caratteri -->

## Descrizione completa (≤ 4000 caratteri)

Zapp è il diario di ciò che guardi. Segna i film e le serie che vuoi vedere, quelli
che stai guardando e quelli che hai finito, con voto e progresso per episodio — e
scopri su quale piattaforma un titolo è disponibile in streaming in Italia, oggi.

COSA FAI CON ZAPP
• Tieni una libreria personale: da vedere, in corso, visti, abbandonati.
• Per ogni film o serie, Zapp ti dice su quali piattaforme è disponibile in Italia
(Netflix, Prime Video, Disney+, NOW e le altre) e ti porta con un tocco
all'app o al sito ufficiale di quella piattaforma.
• Consigli personalizzati, "perché hai visto X" e pillole per genere.
• Cinema vicino a te: orari degli spettacoli, sale preferite, biglietti che hai
acquistato raccolti in un unico posto.
• Amici, recensioni, commenti, liste condivise e una domanda del giorno per
scoprire cosa guardano le persone che segui.
• Importa la cronologia da Netflix, Letterboxd, TV Time o da un file per non
ripartire da zero.
• Segna cosa stai guardando anche con la voce, dicendo "Ehi Siri, sto guardando
una cosa su Zapp", o aggiungi un titolo in libreria direttamente dal foglio di
condivisione di un'altra app.
• Riconosce da solo cosa stai guardando su Netflix, Prime Video, Disney+ e NOW se
glielo permetti (funzione ZConnection, facoltativa, disattivabile in qualsiasi
momento) e aggiorna la libreria da sola.
• Ti avvisa con una notifica quando un amico ti segue, ti consiglia un titolo o
risponde a un commento.

COSA NON FA
Zapp non riproduce film o serie. Non ospita, non trasmette e non scarica alcun
contenuto video, e non aggira in alcun modo le protezioni o gli abbonamenti delle
piattaforme che cita. Quando apri una piattaforma da Zapp esci dall'app ed entri in
quella ufficiale: da lì in poi valgono le sue condizioni e il tuo abbonamento con
lei. Zapp non è affiliata, sponsorizzata né approvata da nessuna delle piattaforme,
dei cataloghi o dei circuiti cinematografici che cita.

PRIVACY
Puoi scaricare i tuoi dati o cancellare l'account in qualsiasi momento dal profilo.
Le funzioni facoltative (personalizzazione, riconoscimento automatico di cosa
guardi) si attivano solo con un consenso esplicito, revocabile quando vuoi.

This product uses the TMDB API but is not endorsed or certified by TMDB.

## Parole chiave App Store (≤ 100 caratteri, separate da virgola)

film,serie tv,streaming,dove guardare,cinema,recensioni,libreria,trailer,watchlist
<!-- 83 caratteri -->

## Categoria

Intrattenimento (Entertainment)

## Classificazione contenuti

Zapp non produce né distribuisce contenuti audiovisivi propri: mostra il catalogo
pubblico TMDB (locandine, trame, cast) e apre le app ufficiali delle piattaforme.
L'unico contenuto generato dagli utenti è testuale (recensioni, commenti, risposte
alla domanda del giorno, liste) e sottoposto a moderazione — tre segnalazioni
nascondono automaticamente un contenuto, riesame entro 7 giorni
(`docs/legal/moderazione.md`, §3). Non c'è pubblicità, non c'è gioco d'azzardo, non
c'è contenuto sessuale prodotto dall'app. Iscrizione da 14 anni in su
(`ETA_MINIMA` in `src/lib/legal/versions.ts`; art. 2-quinquies Codice Privacy).

Indicazioni per i questionari delle botteghe:

- **Apple (età consigliata):** 12+ è la scelta prudente per il rischio di
  linguaggio volgare infrequente/moderato nei contenuti generati dagli utenti
  (recensioni, commenti); nessun'altra categoria (violenza, contenuti sessuali,
  orrore, sostanze, gioco d'azzardo) si applica.
- **Google Play (questionario IARC):** da compilare in Play Console — le risposte
  attese, in base a quanto sopra, sono "nessuna" per tutte le categorie di
  contenuto sensibile salvo "contenuti generati dagli utenti: sì, moderati".

## Note per il revisore Apple

**Account di test:** `zapptest@zapp.dev` / `ZappTest2026!` — libreria, amicizia e
posizione cinema già impostate, per non dover configurare nulla prima della
revisione.

**Perché Zapp non è "solo un sito in una WebView".** L'app aggiunge funzioni
native che il sito da solo non ha (`docs/architecture/mobile.md`):

- **Notifiche push**: attività sociale (nuovo amico, consiglio, risposta a un
  commento) e la domanda del giorno arrivano come notifiche di sistema, non solo
  in-app.
- **Estensione di condivisione (Share Extension)**: dal foglio "Condividi" di
  qualsiasi altra app (per esempio un link Netflix o Prime Video) si aggiunge il
  titolo alla libreria Zapp senza aprire il browser.
- **Siri e Comandi Rapidi (App Intents, iOS 16+)**: "Ehi Siri, sto guardando una
  cosa su Zapp", "Ehi Siri, segna come visto su Zapp", "Ehi Siri, apri un titolo
  su Zapp" parlano con l'app senza aprirla.
- **Apertura nativa delle piattaforme**: i pulsanti "Apri su Netflix / Prime
  Video / Disney+ / …" aprono l'app installata sul telefono (intent su Android,
  URL scheme/Universal Link su iOS), non una pagina web dentro Zapp.
- **Riconoscimento automatico della visione (opzionale, Android)**: con il
  permesso di sistema "Accesso alle notifiche", Zapp riconosce da sola cosa stai
  guardando su Netflix, Prime Video, Disney+ e NOW e aggiorna la libreria —
  legge solo i metadati della sessione multimediale di sistema, mai schermo,
  audio o credenziali.

**Zapp non riproduce contenuti**: nessuna delle funzioni sopra scarica, trasmette
o mostra video di terzi dentro l'app. Ogni pulsante di piattaforma apre l'app
ufficiale di quella piattaforma.

## URL

- Privacy: `https://zapp-mu.vercel.app/privacy`
- Termini: `https://zapp-mu.vercel.app/termini`
- Sito/marketing: `https://zapp-mu.vercel.app`

## Email di supporto

`zappdevteam@gmail.com` — indirizzo del titolare del trattamento
(`docs/legal/registro-trattamenti.md`).

# La domanda del giorno

Ogni giorno una domanda su film e serie (`daily_questions`, elenco scritto a mano,
una riga per data, `media_scope` movie|tv|any). Si risponde con **un titolo** e un
motivo **facoltativo** (140 caratteri); il giorno dopo, prima della domanda nuova,
si apre il **podio** dei tre titoli più scelti. Spec:
`docs/superpowers/specs/2026-09-08-domanda-del-giorno-design.md`.

- **Il giorno è Europe/Rome**, mai UTC: `romeDateString()`/`previousDay()` di
  `src/lib/cinema/dates.ts` lato codice, `(now() at time zone 'Europe/Rome')::date`
  in SQL. Una risposta per utente, correggibile fino a mezzanotte; dopo, la giornata
  è chiusa (policy e trigger, non solo interfaccia).
- **È un popup, non una pagina**: riquadro 400px in verticale sul telefono e
  **21:9 su desktop** (`lg:aspect-[21/9]`, largo `min(1120px,82vw)` e
  `min(1320px,76vw)` da `2xl`: 1120×480 a 1440, 1320×566 a 1920), con l'app
  velata e visibile tutt'attorno — un velo a
  tutto schermo lo faceva leggere come una schermata a sé. Il fondo del riquadro
  **non è nero**: è `.daily-veil` (globals.css), grigio scuro che sfuma nel
  viola chiaro `#c5baf4` dei bottoni. Dentro c'è il fotogramma del film vincente,
  ma **dietro al vetro, non in primo piano** (richiesta utente 2026-09-09: da
  immagine di copertina "ostruiva la visibilità"; poi "deve comunque esserci
  l'immagine, ma sfumata bene"). È il **fotogramma 16:9**, non la locandina: deve
  riempire la card esattamente a qualunque forma (verticale sul telefono, 21:9 da
  `lg`), e una 2:3 lì dentro o si taglia o lascia dei vuoti — provata a due strati,
  scartata dall'utente. Sorgente `original` e `unoptimized` come gli altri backdrop,
  `object-cover`, `opacity-[0.85]`, `blur-[10px]` (`lg:blur-[14px]`), dentro un
  riquadro che sborda del 14% perché la sfocatura non lasci un alone sui bordi; sopra
  un velo `bg-black/25` e poi `.daily-glass` — le stesse tinte grigio/lavanda del velo,
  qui traslucide (grigio a 0,46/0,52/0,58). Niente veli neri pieni. **Il contenuto sta sopra al vetro solo perché è `relative z-10`**: fotogramma
  e `.daily-glass` sono elementi *posizionati*, quindi si dipingono sopra a un blocco
  statico, e per tre giri di ritocchi il testo bianco è stato letto attraverso il velo
  — cioè grigio, per quanto `color` dicesse `#ffffff`. Misurato, non guardato: lo
  screenshot Playwright del solo `h2` aveva luminanza massima **102**; con lo `z-10`
  è 255. Un colore giusto nel DevTools non prova che sia quello a schermo.
  **Sopra l'immagine il testo è bianco pieno con un'ombra**, mai un grigio dei token
  (richiesta utente: "bianche e ben visibili"): overline e titoli del podio
  `font-semibold`, domanda `font-medium`, voti, motivo e nome bianchi, tutti con
  `text-shadow`. Da `lg` la
  domanda sta a sinistra in grande, le proposte a destra su una riga da sei.
  Sul 21:9 di desktop il podio deve starci **tutto senza scorrere** — overline,
  domanda, gradini, motivo: locandine 124/96px (146/112 da `2xl`), `gap-3`,
  `lg:pt-5 lg:pb-2`; misurato con Playwright (`section.scrollHeight` = `clientHeight`),
  non a occhio: prima la domanda era tagliata in alto e il motivo finiva sotto i puntini. Le informazioni stanno **libere sul fondo**, senza
  scatole interne (richieste utente 2026-09-08): davanti a un
  campo di ricerca vuoto ci si blocca a pensare a tutti i film, quindi il
  composer apre con le **proposte dalla libreria** — `getAnswerSuggestions`
  (voti più alti, poi visti di recente senza doppioni, filtrate per
  `media_scope`) — e un tocco basta a rispondere; la ricerca si apre solo con
  "Cerca un altro titolo". Podio con entrata sfalsata e voti che salgono da zero,
  tutto fermo con `prefers-reduced-motion`.
- Moduli: `src/lib/daily/` (`rank.ts` puro con Vitest — podio, pareggio a chi ha
  scelto per primo, motivo in evidenza, `cleanReason`; `queries.ts` server-only;
  `actions.ts` Server Actions) e `src/components/daily/`. In pagina è **un solo
  componente client** montato nello slot `right` di `TopNav` dal layout `(app)`,
  dietro `Suspense` come la campanella: rende l'icona accanto alla campanella e,
  alla prima apertura del giorno, l'overlay a tutto schermo (podio di ieri →
  domanda di oggi, due schermate a snap come `ScanMode`, chiusura che rimpicciolisce
  verso l'icona).
- **Col popup aperto si scorre dentro il popup, non la pagina sotto**: mentre è
  aperto il `body` è `overflow: hidden` **e** `position: fixed` con `top` alla
  posizione corrente (su iOS il solo `overflow` non basta), rimessa alla chiusura
  con `window.scrollTo` — altrimenti chiudendo si tornava in cima. Dentro:
  `overscroll-contain` ovunque (niente scroll chaining) e **lo scorrevole
  orizzontale ha `min-h-0 flex-1` a tutte le misure**: senza, sotto `lg` cresceva
  col contenuto, il riquadro lo tagliava e non scorreva più niente né dentro né
  fuori (1044px di contenuto in 656 di riquadro, verificato con Playwright).
  Sotto `lg` scorre lo scorrevole (`overflow-y-auto`), da `lg` la singola
  schermata (`lg:h-full lg:overflow-y-auto`), dove il 21:9 dà un'altezza vera.
- **"Visto oggi" sta in `daily_question_views`, non in `localStorage`** (regola del
  progetto): per questo il popup non ricompare su un altro dispositivo.
- **Il podio di oggi non si legge**: `daily_question_podium(day)` ha `day < oggi`
  dentro la funzione, altrimenti si risponderebbe guardando i risultati. Per lo
  stesso motivo l'elenco delle risposte di oggi è **in ordine di tempo**, mai per
  voti. I conteggi di un giorno chiuso non cambiano più: stanno in `unstable_cache`
  con la data come chiave (nessun cron), letti col service client perché dentro
  `unstable_cache` non si possono leggere i cookie — ritorna solo numeri, mentre
  motivi e nomi si leggono con la sessione dell'utente.
- **Una funzione richiamata da una policy dev'essere eseguibile da chi scrive.**
  `is_today_question` era revocata da `authenticated` per non esporla come
  `/rest/v1/rpc/...` e ogni risposta falliva con `permission denied for function`
  (42501): la migration `0023` l'ha eliminata e ha messo la condizione dentro le tre
  policy. Stessa forma, nessun endpoint in più.
- **Ogni risposta è firmata, anche quella di un profilo privato** (scelta utente
  2026-09-08: dalla risposta si deve poter arrivare al profilo e mandare la
  richiesta di amicizia). L'autore si legge da **`user_search`**, non da
  `profiles`: la vista espone solo nome utente, nome e avatar — gli stessi campi
  che già mostra a chi cerca quel nome utente — ed esiste apposta per trovare un
  privato e invitarlo. `profiles_select_visible` resta com'è, quindi libreria,
  attività e statistiche di un privato restano nascoste; `/u/<username>` di un
  privato mostra nome, foto e il bottone Aggiungi, con le liste vuote. Il motivo segnalato 3 volte sparisce dalla vista (colonna
  `report_count` dal trigger su `reports`, che ora accetta anche
  `target_type = 'daily_answer'`) ma **il suo voto resta nel conteggio**: altrimenti
  tre account d'accordo farebbero cadere un titolo dal podio.
- Domande: `pnpm tsx --env-file=.env.local scripts/seed-daily-questions.ts`
  (80 domande, una al giorno da domani, idempotente su `ask_on`). Finite le
  domande: niente popup e niente icona, nessun errore.
- Verifica: `node scripts/daily-question-check.mjs` prova dal lato client, con una
  sessione vera, tutto ciò che non deve riuscire (riscrivere ieri, rispondere a una
  domanda vecchia o al posto di un altro, sfogliare le domande future, leggere il
  podio di oggi, toccare `report_count`); crea utenti finti e li cancella.
  **La cache del podio vive anche in memoria nel processo**: per riprovare uno
  scenario con dati nuovi su un giorno passato bisogna riavviare il server, non solo
  svuotare `.next*/cache/fetch-cache`.
- **Un asse di scorrimento per elemento**: l'overlay scorre in orizzontale (due
  schermate con `snap-x snap-mandatory`) e **ogni schermata** scorre per conto suo in
  verticale. Con i due assi sullo stesso elemento, sul telefono lo snap orizzontale
  rientrava a ogni scorrimento verso il basso e la card tremava scivolando a sinistra
  (segnalazione utente 2026-09-09). Collaudo: `node scripts/daily-scroll-check.mjs`
  (Playwright 390x844, poi schermo corto per far eccedere il contenuto: la card non si
  sposta di lato, il contenuto scorre, le frecce cambiano schermata).
- **Il podio è un podio** (2026-09-09, richiesta utente): tre gradini in vetro
  **attaccati** (separati sembravano tre schede), il vincitore al centro sul più alto
  e più largo, la locandina sopra al suo gradino, la medaglia — oro, argento, bronzo,
  anello in `conic-gradient`, esadecimali grezzi come per `PROVIDER_BRAND` — appesa al
  bordo basso della locandina. Titolo e voti stanno **dentro** al gradino: è la targa
  del posto, non una scatola vuota. Sotto, un filo di luce fa da pavimento; dietro al
  primo, l'unico bagliore dorato della schermata. Da `lg` il riquadro è 21:9 e il podio
  sta a destra, domanda e motivo a sinistra: schiacciato in colonna non ci stava.
  I gradini salgono dal terzo al primo (`framer-motion`, molla), i voti contano da zero.
- **I coriandoli cadono una volta al giorno**: `Confetti.tsx` (canvas, nessuna
  libreria, ~90 rettangoli disegnati a mano, 3,2 s con dissolvenza finale) parte solo
  quando il popup **si apre da solo**, cioè alla prima apertura del giorno
  (`celebrate={!seen}`); riaperto dall'icona il podio è già noto e resta quieto.
  `prefers-reduced-motion`: niente canvas.
  Verifica a occhio: `node scripts/daily-podium-shot.mjs` semina una classifica finta
  su ieri, apre il popup con una sessione vera e salva `podio-390-coriandoli.png`,
  `podio-390.png`, `podio-1440.png`. Va lanciato **a server appena avviato**: i
  conteggi del podio stanno in `unstable_cache` per giorno.


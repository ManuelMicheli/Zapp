# Data Safety (Google Play) e App Privacy (Apple)

Ogni riga cita la sua fonte: il codice, o `docs/architecture/legal.md` /
`docs/legal/registro-trattamenti.md` / `docs/legal/fornitori.md`. Dove il codice non
dice abbastanza per rispondere con certezza, è segnato **[da verificare]** invece di
essere inventato.

## Cosa raccoglie Zapp (base per entrambi i questionari)

| Dato                                                                                        | Da dove                                                                         | Facoltativo?                                                       | Fonte                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Email, username, nome visualizzato, avatar                                                  | Registrazione                                                                   | Obbligatorio (account)                                             | `src/app/(legal)/privacy/page.tsx` §2 "Account"; `docs/legal/registro-trattamenti.md` finalità 1                                      |
| Anno di nascita                                                                             | Onboarding                                                                      | Obbligatorio (verifica età minima)                                 | `docs/architecture/legal.md` "Età minima"; `ETA_MINIMA` in `src/lib/legal/versions.ts`                                                |
| Libreria (titoli, stato, voti, progresso episodi)                                           | Uso dell'app                                                                    | Obbligatorio (è la funzione principale)                            | `src/app/(legal)/privacy/page.tsx` §2 "Libreria"                                                                                      |
| Contenuti sociali (recensioni, commenti, liste, amicizie, risposte alla domanda del giorno) | Uso dell'app                                                                    | Facoltativo (funzioni social)                                      | `src/app/(legal)/privacy/page.tsx` §2 "Contenuti sociali"                                                                             |
| Eventi di navigazione per la personalizzazione (copertine viste/aperte)                     | Uso dell'app, con consenso                                                      | Facoltativo, consenso dedicato revocabile dal profilo              | `docs/architecture/legal.md` "Dove si chiedono"; `docs/legal/registro-trattamenti.md` finalità 2                                      |
| Visioni riconosciute automaticamente (titolo, episodio, minutaggio, piattaforma)            | ZConnection (estensione browser) o scrobble Android, con consenso separato      | Facoltativo, consenso `scrobble` prima di collegare un dispositivo | `docs/architecture/legal.md` "Il consenso `scrobble` blocca davvero la raccolta"; `docs/architecture/mobile.md` "Scrobble su Android" |
| Posizione (comune scritto a mano, o coordinate GPS via `navigator.geolocation`)             | Sezione Cinema, solo se l'utente la concede                                     | Facoltativo — c'è sempre l'alternativa "scrivi il tuo comune"      | `src/components/cinema/LocationPrompt.tsx`; `src/lib/cinema/queries.ts` (`getViewerLocation`, tabella `user_locations`)               |
| Cinema preferiti, serate pianificate, biglietti caricati                                    | Sezione Cinema                                                                  | Facoltativo                                                        | `docs/legal/registro-trattamenti.md` finalità 4                                                                                       |
| Token push (Expo)                                                                           | Dopo l'abbinamento del dispositivo, se l'utente accetta le notifiche di sistema | Facoltativo (permesso di sistema)                                  | `docs/architecture/mobile.md` "Notifiche push" → "Token e ricevute"; tabella `push_tokens`                                            |
| Identificativo e nome del dispositivo (telefono, TV, estensione browser)                    | Abbinamento dispositivo                                                         | Obbligatorio per usare le funzioni collegate a un dispositivo      | `docs/architecture/mobile.md` "Una sola autenticazione"                                                                               |

**Nessuna categoria particolare di dati (art. 9 GDPR)** è raccolta di proposito —
`docs/legal/registro-trattamenti.md` §1, nota sotto la tabella.

## Google Play — Data Safety

**L'app raccoglie o condivide dati?** Sì.

| Categoria del questionario | Voce                                                               | Raccolta                                 | Condivisione con terzi                                     | Obbligatoria                                    | Cifrata in transito | Cancellabile dall'utente                                           |
| -------------------------- | ------------------------------------------------------------------ | ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| Informazioni personali     | Indirizzo email                                                    | Sì                                       | No                                                         | Sì                                              | Sì                  | Sì                                                                 |
| Informazioni personali     | Nome utente / nome visualizzato                                    | Sì                                       | No                                                         | Sì                                              | Sì                  | Sì                                                                 |
| Posizione                  | Posizione approssimativa                                           | Sì, solo se concessa                     | No                                                         | No                                              | Sì                  | Sì                                                                 |
| Attività nell'app          | Cronologia di visione / libreria                                   | Sì                                       | No                                                         | Sì                                              | Sì                  | Sì                                                                 |
| Attività nell'app          | Altri contenuti generati dall'utente (recensioni, commenti, liste) | Sì                                       | No                                                         | No                                              | Sì                  | Sì                                                                 |
| Identificativi             | Identificativo del dispositivo                                     | Sì                                       | No (uso interno per l'abbinamento)                         | Sì (per le funzioni collegate a un dispositivo) | Sì                  | Sì (revoca da `/devices`)                                          |
| Identificativi             | Token di notifica push                                             | Sì, se si accetta il permesso di sistema | **Sì — a Expo/650 Industries**, per recapitare la notifica | No                                              | Sì                  | Sì (si cancella disattivando le notifiche o cancellando l'account) |

**Perché "condivisione con terzi" è No per quasi tutto.** Supabase (database,
autenticazione, storage) e Vercel (hosting, funzioni) trattano i dati **per conto
di Zapp**, con un DPA in vigore per incorporazione nei rispettivi termini — sono
responsabili del trattamento (art. 28 GDPR), non destinatari terzi: Google Play non
richiede di dichiarare come "condivisione" i dati passati a un fornitore che li
tratta solo su istruzione del titolare e con un accordo in vigore.
(`docs/legal/fornitori.md` §1). TMDB riceve solo la query di ricerca del catalogo,
mai un identificativo dell'utente (`docs/legal/fornitori.md` §2) — non riceve dati
personali da condividere.

**L'eccezione è il token push.** Expo (il servizio che recapita le notifiche,
gestito da 650 Industries) riceve il token del dispositivo per inoltrarlo ad
Apple/Google — è un passaggio necessario di qualunque sistema di push basato su
Expo, ma **[da verificare]**: `docs/legal/fornitori.md` non elenca oggi un DPA
Expo fra i responsabili del trattamento. Da aggiungere lì (fuori dallo scopo di
questo task, che tocca solo `docs/project/store/`) prima di dichiarare "nessuna
condivisione" in modo pienamente accurato.

**Cifratura in transito:** sì, tutto il traffico passa per HTTPS/TLS (Vercel,
Supabase). Nessuna eccezione nota nel codice.

**Cancellazione dei dati:** l'utente può cancellare l'account dal profilo
(`deleteAccount`, conferma digitando lo username) — la cascata delle chiavi
esterne su `auth.users` cancella libreria, contenuti sociali, dispositivi e
sessioni; dopo il logout si atterra su **`/addio`**, la pagina pubblica che
conferma l'operazione (`docs/architecture/legal.md` "Cancellazione (art. 17)").
Prima di cancellare l'account, l'utente può anche scaricare tutti i suoi dati
(`GET /api/account/export`, stesso file).

**Pubblico target / minori:** l'app non è rivolta ai minori di 14 anni
(`ETA_MINIMA` in `src/lib/legal/versions.ts`; art. 2-quinquies Codice Privacy).

## Apple — App Privacy (Nutrition Label)

Categorie da dichiarare in App Store Connect, in base ai dati sopra:

| Data Type (Apple)                | Corrisponde a                                                                                                                                                   | Linked to user | Used for Tracking |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------- |
| **Contact Info → Email Address** | Email dell'account                                                                                                                                              | Sì             | No                |
| **Contact Info → Name**          | Nome utente / nome visualizzato                                                                                                                                 | Sì             | No                |
| **User Content**                 | Libreria, recensioni, commenti, liste, biglietti caricati                                                                                                       | Sì             | No                |
| **Identifiers → Device ID**      | Identificativo del dispositivo abbinato, token push                                                                                                             | Sì             | No                |
| **Usage Data**                   | Cronologia di visione (compresa quella riconosciuta da ZConnection/scrobble)                                                                                    | Sì             | No                |
| **Location → Coarse Location**   | Posizione per la sezione Cinema (comune o GPS a bassa precisione: nessun `enableHighAccuracy` nel codice, e c'è sempre l'alternativa del comune scritto a mano) | Sì             | No                |

**Tracking:** No in ogni riga — Zapp non usa i dati per pubblicità mirata né li
condivide con broker di dati o reti pubblicitarie; nessun SDK di tracciamento nel
codice (`docs/legal/fornitori.md` non elenca reti pubblicitarie, e KLIPY, l'unico
servizio di terzi contattato direttamente dal browser oltre a TMDB e YouTube, ha la
pubblicità disattivata — `docs/legal/fornitori.md` §3).

**"Data Used to Track You":** nessuna — coerente con "Tracking: No" su ogni riga.

**Data Not Collected:** Financial Info, Health & Fitness, Messages, Photos/Videos
(i biglietti caricati sono file dell'utente collegati al suo account, non media
"raccolti" per finalità di Zapp — restano nel bucket privato dell'utente),
Browsing History, Purchases, Sensitive Info, Contacts, Search History (oltre alla
ricerca titoli, che è funzionale e non salvata come profilo — **[da verificare]**
se le "ricerche recenti" lato client vadano dichiarate: sono per utente, lette
dal server, non condivise — vedi `docs/architecture/routes.md` se il dettaglio
serve).

## Cosa resta aperto

- Aggiungere Expo (650 Industries) a `docs/legal/fornitori.md` come destinatario
  del token push, con verifica se esiste già un DPA incorporato nei suoi termini
  (come per Supabase/Vercel/Upstash) — non fatto qui perché fuori dallo scopo di
  questo task (`docs/project/store/`).
- Le risposte sopra sono la base per compilare il questionario **nell'interfaccia**
  di Play Console e App Store Connect: nessuno dei due si compila da file, vanno
  ricopiate a mano (vedi `checklist.md`).

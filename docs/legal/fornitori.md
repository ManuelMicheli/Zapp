# Responsabili del trattamento e fornitori (art. 28 GDPR)

**Titolare:** Manuel Micheli
**Ultimo aggiornamento:** 2026-09-12

I **responsabili** trattano dati personali per conto del titolare e richiedono un accordo
ai sensi dell'art. 28 (DPA). Gli altri servizi sono elencati sotto perché il traffico li
raggiunge, ma non ricevono dati personali per nostro conto.

## 1. Responsabili del trattamento

| Fornitore | Cosa fa per Zapp | Dati trattati | Sede dei dati | DPA accettato il | Trasferimenti extra-UE |
|---|---|---|---|---|---|
| Supabase | Database, autenticazione, archiviazione dei file (biglietti, avatar) | Tutti i dati dell'account e dei contenuti | Unione Europea | *(da riempire: accettare in dashboard)* | Nessuno per i dati a riposo |
| Vercel | Hosting dell'applicazione, esecuzione delle funzioni, log | Dati in transito, indirizzo IP, log di richiesta | Esecuzione a Francoforte (`fra1`); società statunitense | *(da riempire: accettare in dashboard)* | SCC della Commissione europea + EU-US Data Privacy Framework |
| Upstash | Limiti di frequenza condivisi | Identificativo utente e contatori, a finestra di minuti | Regione UE | *(da riempire: accettare in dashboard)* | Nessuno se la regione UE resta impostata |

> Le tre date vanno riempite **a mano**, dopo aver accettato il DPA nella dashboard di
> ciascun fornitore. Finché una casella è vuota, quel trattamento è privo dell'accordo
> che l'art. 28(3) richiede per iscritto.

## 2. Servizi interrogati dai nostri server (nessun dato personale inviato)

| Servizio | A cosa serve | Cosa riceve |
|---|---|---|
| TMDB | Catalogo di film e serie, immagini, provider di streaming | La query del catalogo. Mai un identificativo utente |
| Open-Meteo | Meteo per la fila contestuale della home | Coordinate approssimate, senza chi le ha chieste |
| Nominatim / OpenStreetMap | Geocodifica delle città e delle sale | Nome della località |
| MyMovies e circuiti cinematografici (UCI, The Space, Notorious, Cinelandia) | Orari degli spettacoli | Nessun dato dell'utente |
| YouTube Data API | Ricerca dei trailer ufficiali, dal server | La query di ricerca |

## 3. Servizi contattati direttamente dal browser dell'utente

Vedono l'indirizzo IP dell'utente per il solo fatto di servire una risorsa. Sono
dichiarati nell'informativa e nella CSP di `next.config.ts`; aggiungerne uno richiede di
modificare entrambe.

| Servizio | Cosa serve | Cosa vede |
|---|---|---|
| `image.tmdb.org` | Locandine e fondali | Indirizzo IP, immagine richiesta |
| `youtube-nocookie.com` | Trailer incorporati | Indirizzo IP, video richiesto. Dominio senza cookie di profilazione |
| KLIPY | GIF e sticker nei commenti | Indirizzo IP, ricerca digitata. Pubblicità disattivata |

## 4. Manutenzione

Chi aggiunge un fornitore aggiunge una riga qui, una voce nell'informativa pubblica
(`/privacy`, sezione 4) e — se il browser lo contatta direttamente — un'origine nella CSP.
Tre posti, nessuno dei quali è facoltativo.

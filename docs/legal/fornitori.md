# Responsabili del trattamento e fornitori (art. 28 GDPR)

**Titolare:** Manuel Micheli — contatto: `zappdevteam@gmail.com`
**Ultimo aggiornamento:** 2026-09-12

I **responsabili** trattano dati personali per conto del titolare e richiedono un accordo
ai sensi dell'art. 28 (DPA). Gli altri servizi sono elencati sotto perché il traffico li
raggiunge, ma non ricevono dati personali per nostro conto.

## 1. Responsabili del trattamento

| Fornitore | Cosa fa per Zapp | Dati trattati | Sede dei dati | DPA in vigore dal · copia archiviata il | Trasferimenti extra-UE |
|---|---|---|---|---|---|
| Supabase | Database, autenticazione, archiviazione dei file (biglietti, avatar) | Tutti i dati dell'account e dei contenuti | Unione Europea | In vigore con l'accettazione dei termini · PDF archiviato il 2026-09-12 | Nessuno per i dati a riposo |
| Vercel | Hosting dell'applicazione, esecuzione delle funzioni, log | Dati in transito, indirizzo IP, log di richiesta | Esecuzione a Francoforte (`fra1`); società statunitense | In vigore con l'accettazione dei termini · PDF archiviato il 2026-09-12 | SCC della Commissione europea + EU-US Data Privacy Framework |
| Upstash | Limiti di frequenza condivisi | Identificativo utente e contatori, a finestra di minuti | Regione UE | In vigore con l'accettazione dei termini · PDF archiviato il 2026-09-12 | Nessuno se la regione UE resta impostata |

### Come sono in vigore

Nessuno dei tre fornitori chiede una firma separata: in tutti e tre i casi il DPA è
**incorporato per riferimento nei termini di servizio**, quindi vincola dal momento
dell'iscrizione. L'art. 28(3), che vuole l'accordo per iscritto, è soddisfatto così.

Le copie sono state scaricate e archiviate il **2026-09-12** per averle a portata di mano
in caso di richiesta:

| Fornitore | Testo del DPA |
|---|---|
| Supabase | <https://supabase.com/legal/dpa> |
| Vercel | <https://vercel.com/legal/dpa> — PDF: <https://assets.vercel.com/image/upload/q_auto/front/legal/dpa/Vercel_Inc_-_Data_Processing_Addendum.pdf> |
| Upstash | <https://upstash.com/trust/dpa.pdf> |

Chi volesse la copia controfirmata la ottiene scrivendo al fornitore (per Supabase:
`privacy@supabase.com`). Non è necessaria alla conformità: serve solo come prova comoda.

Quando un fornitore aggiorna il proprio DPA, si riscarica la copia e si aggiorna la data
qui: l'archivio deve corrispondere al testo in vigore, non a quello di due anni fa.

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

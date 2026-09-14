# Percorso cinefilo — piano di implementazione

**Obiettivo:** incentivare partecipazione con livelli, traguardi e prossimo obiettivo; distinguere identità e qualifiche verificate senza cambiare il peso dei voti.
**Specifica:** proposta approvata nella conversazione del 14 settembre 2026; le regole operative qui sotto ne completano i dettagli.
**Architettura:** conteggi SQL sotto RLS, calcolo puro TypeScript condiviso, componenti nei profili e verifica negli autori delle recensioni. Nessun accumulatore di punti modificabile dal client.
**Stack:** Next.js, TypeScript, Supabase, Tailwind e Vitest già presenti.

## Regole

- 5 punti per film o serie distinti in stato watched, 2 per titolo con voto, 10 per recensione non moderata di almeno 80 caratteri dopo trim. Conteggi correnti, non eventi: undo, rimozione e modifiche ricalcolano il totale; nessun guadagno ripetuto sullo stesso titolo. Recensioni già uniche per utente/titolo/tipo.
- Limite punti: visioni 2500, voti 2000, recensioni 5000. Import inclusi, episodi non moltiplicano i punti. Regole e limiti visibili nel dettaglio del percorso. La lunghezza minima è un criterio di partecipazione, non una certificazione di qualità.
- Livelli: Spettatore 0, Appassionato 100, Esploratore 400, Cinefilo 1000, Grande cinefilo 2500, Voce della community 5000. Niente privilegi algoritmici e niente classifica.
- Traguardi per film (1/25/100/500), serie (1/10/50/100), voti (1/25/100/500), recensioni (1/5/25/100). Mostrare massimo tre traguardi ottenuti in sintesi, tutti i traguardi e il prossimo obiettivo nei dettagli.
- Privacy: nessun dato di libreria privata deve uscire dai conteggi, dagli indicatori o dai traguardi. Usare SECURITY INVOKER e mostrare il percorso solo quando la libreria è leggibile secondo le regole esistenti. Non scambiare un errore di caricamento per livello zero.
- Verifica: verified_at e verified_role protetti; ruoli critic/director/actor/public_figure, etichette italiane. Ruolo nullo ammesso per sola identità verificata; ruolo senza verifica vietato. Nessun utente può autoassegnarseli; operazione manuale DB documentata per assegnazione e revoca. Nessuna verifica assegnata automaticamente.
- UI italiana, token esistenti, nessuna dipendenza, mantenere attribuzione TMDB e privacy. Nessun push/deploy previsto.

## Compiti e proprietà

### 1. Dominio e database
- [x] Creare `src/lib/profile/progression.ts` con `ProgressionCounts {films, series, ratings, reviews}`, `ProfileRecognition {verifiedAt: string | null, verifiedRole: "critic" | "director" | "actor" | "public_figure" | null}`, `buildProgression(counts)` e `parseProgressionCounts(json)`.
- [x] Testare prima soglie esatte, limiti, dati malformati/negativi, traguardi e regressione dei conteggi dopo rimozione.
- [x] Aggiungere migration `0057_profile_progression.sql`: RPC `profile_progression(uid uuid)` JSON con chiavi films/series/ratings/reviews; verifica protetta su profiles; grant anon revocati. Mantenere RLS e grant per colonna.
- [x] Creare `src/lib/profile/progression-queries.ts`: `getProfileProgression(uid): Promise<ProgressionCounts | null>`; session client, log generico lato UI in caso di errore. Aggiornare tipi DB; tentare rigenerazione reale e documentare eventuali limiti dell'ambiente.
- [x] Documentare regole e procedura di verifica in `docs/architecture/social.md`.

### 2. Interfaccia e integrazione
- [x] Componenti `ProfileProgression` (counts, isOwn) e `VerifiedIdentity` (recognition), riusare stile profilo. Dettaglio espandibile accessibile, progress bar etichettata, suggerimento del prossimo traguardo.
- [x] Integrare `/profile` e `/u/[username]`, rispettare ramo profilo privato; rendere verifica accanto al nome anche nell'editor proprio.
- [x] Integrare verifica negli autori in `TitleReviews.tsx` e `ReviewsClient.tsx`; query batch esistenti, nessuna lettura per singola recensione.
- [x] Rispettare assenza di dati: omettere riconoscimento non verificato, messaggio non disponibile per errore del percorso. Nessuna modifica ad aggregazione o ordinamento voti.

### 3. Revisione e verifiche
- [x] Rivedere diff e controlli permessi SQL, allineamento conteggi e UI, flussi import/undo/moderazione.
- [x] Eseguire test mirati poi `pnpm typecheck`, `pnpm lint`, `pnpm test`, build isolata con NEXT_DIST_DIR.
- [x] Verificare rendering responsive se ambiente autenticato disponibile; segnalare limiti effettivi senza dichiarare verifiche non eseguite.
- [x] Riportare stato migration/applicazione e rilascio separatamente dal codice completato.


## Consegna e limiti della verifica

Implementazione sul branch feat/profile-progression. Nessun commit, push o deploy eseguito; migrazione 0057 non applicata al database live. Supabase CLI non disponibile nell'ambiente: database.ts allineato manualmente a enum, colonne e RPC; rigenerarlo dal database dopo l'applicazione della migrazione.

Verifiche: suite finale 1.245 test su 116 file; typecheck e lint superati. Migrazione reale applicata in PGlite con fixture limitata: 16 controlli di conteggi, RLS, privilegi e vincoli superati. I test non coprono Auth/PostgREST/Storage reali. Anteprima dei componenti con CSS della build: nove casi a 320/390/1280 px senza overflow e dettaglio apribile da tastiera; flusso autenticato completo non collaudato sul database di destinazione.

Prima build riuscita. Un secondo tentativo sulla stessa cache ha avuto un errore interno di Next.js; build finale riuscita in .next-profile-progression-final (42 pagine generate). Log e report in artifacts/profile-progression-db/.

/**
 * Dimensione massima di un blocco per chiamata. L'import è spezzato dal client
 * in più Server Action brevi: una sola richiesta lunga minuti viene chiusa dal
 * browser (Safari taglia un fetch senza risposta dopo 60 s, Chrome dopo 300 s)
 * e il client esplode con "Application error", anche se il server finisce.
 * Condivise fra client e action (un file "use server" esporta solo funzioni).
 */
export const MATCH_CHUNK_SIZE = 30;
export const CONFIRM_CHUNK_SIZE = 25;

/**
 * Blocchi di riconoscimento in volo insieme. Il riconoscimento è la fase lenta
 * (una o più ricerche TMDB per candidato, throttle 15 req/s per istanza): con i
 * blocchi in fila un CSV da centinaia di titoli ci metteva minuti. Le Server
 * Action parallele finiscono su istanze diverse, quindi ognuna ha il suo
 * throttle; oltre 3 il guadagno sparisce e si rischia il rate limit di TMDB.
 */
export const MATCH_CONCURRENCY = 3;

/**
 * Quanto può pesare in tutto quello che si carica in una richiesta. Il tetto è
 * sulla **somma**, non sul singolo file: quello che deve entrarci è il corpo
 * della Server Action, e Next lo misura intero
 * (`experimental.serverActions.bodySizeLimit` in `next.config.ts`, tenuto un
 * mega sopra per le intestazioni del multipart). Il default di Next è 1 MB:
 * sopra il tetto la richiesta non arriva nemmeno alla action, la promise si
 * rifiuta e l'utente legge un errore di rete al posto del vero motivo.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Come si scrive quel tetto in pagina e nei messaggi d'errore. */
export const MAX_FILE_LABEL = `${MAX_FILE_BYTES / 1024 / 1024}MB`;

/**
 * Quanti file per richiesta. L'export di Letterboxd sono quattro csv, più di
 * così non ha senso; senza tetto, N archivi in una richiesta erano N budget di
 * decompressione e una funzione che finisce la memoria non restituisce il posto
 * dell'import (che è di tutta l'app, `POSTI_IMPORT`).
 */
export const MAX_UPLOAD_FILES = 8;

/**
 * Tetto del singolo file caricato su Storage (sorgente "export"). Non e' il
 * tetto della Server Action: qui il file non passa dal corpo della richiesta,
 * sale dal client direttamente nel bucket `import-uploads`, il cui
 * `file_size_limit` (migration 0059) e' lo stesso numero — e' quello il vincolo
 * vero, questo e' solo il controllo lato client che da' un messaggio leggibile
 * prima di tentare l'upload. Un export Apple completo sta sotto i 100 MB; di
 * quei byte, il server apre solo le tabelle dentro l'archivio, e il tetto sul
 * decompresso di questo percorso e' `MAX_UNZIPPED_STORAGE_BYTES` (50 MB, la
 * memoria della funzione) — non i 10 MB del percorso a corpo, che facevano
 * fallire l'import molto prima dei 100 MB promessi in pagina.
 */
export const MAX_STORAGE_BYTES = 100 * 1024 * 1024;

/** Come si scrive quel tetto in pagina e nei messaggi d'errore. */
export const MAX_STORAGE_LABEL = `${MAX_STORAGE_BYTES / 1024 / 1024}MB`;

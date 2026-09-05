/**
 * Dimensione massima di un blocco per chiamata. L'import è spezzato dal client
 * in più Server Action brevi: una sola richiesta lunga minuti viene chiusa dal
 * browser (Safari taglia un fetch senza risposta dopo 60 s, Chrome dopo 300 s)
 * e il client esplode con "Application error", anche se il server finisce.
 * Condivise fra client e action (un file "use server" esporta solo funzioni).
 */
export const MATCH_CHUNK_SIZE = 30;
export const CONFIRM_CHUNK_SIZE = 25;

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { stimaArrivo } from "./richieste";

/**
 * Riga di `import_requests` (migration 0063, scritta ma non ancora applicata): il
 * tipo non è ancora in `src/types/database.ts`, che si rigenera solo dopo che il
 * controller applica la migration sul database vero. Tipizzata a mano finché non
 * succede, invece di forzare i tipi generati o toccare quel file — come già fatto
 * per `user_platforms` in `src/lib/platforms/user.ts`.
 */
interface RigaImportRequest {
  id: string;
  platform_key: string;
  requested_at: string;
  expected_at: string;
  state: "requested" | "imported" | "dismissed";
}

/** Una richiesta d'accesso ai dati aperta, in forma leggibile dal chiamante. */
export interface RichiestaImport {
  id: string;
  platformKey: string;
  requestedAt: string;
  expectedAt: string;
  state: "requested" | "imported" | "dismissed";
}

function mappa(riga: RigaImportRequest): RichiestaImport {
  return {
    id: riga.id,
    platformKey: riga.platform_key,
    requestedAt: riga.requested_at,
    expectedAt: riga.expected_at,
    state: riga.state,
  };
}

/**
 * Segna che l'utente ha appena chiesto l'export a `key` (una delle piattaforme
 * "ad attesa" di `azioniPer`, in `src/lib/platforms/azioni.ts`): calcola la data
 * attesa con `stimaArrivo` e apre una riga. Una sola richiesta aperta per
 * piattaforma è garantita dal database (indice unico parziale
 * `import_requests_open_unique` su `(user_id, platform_key) where state =
 * 'requested'`, migration 0063), non da questo controllo: il controllo qui
 * sotto è solo un'ottimizzazione per non arrivare all'insert nel caso normale.
 * Due clic ravvicinati (o un ritentativo di rete) possono superarlo entrambi
 * prima che il primo insert sia committato — a quel punto è l'indice a
 * fermare il secondo, e la violazione (`23505`) si legge come "c'è già",
 * cioè successo: chi preme due volte deve vedere la stessa cosa di chi preme
 * una volta sola, non un errore.
 */
export async function segnaRichiesta(userId: string, key: string): Promise<boolean> {
  const supabase = await createClient();
  // `import_requests` non è ancora nei tipi generati (vedi RigaImportRequest sopra).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tabella = () => supabase.from("import_requests" as any);

  const { data: aperte, error: erroreLettura } = await tabella()
    .select("id")
    .eq("user_id", userId)
    .eq("platform_key", key)
    .eq("state", "requested")
    .limit(1);
  if (erroreLettura) {
    console.error("[import] verifica richieste aperte fallita:", erroreLettura);
    return false;
  }
  if (((aperte ?? []) as unknown[]).length > 0) return true;

  const oggi = new Date().toISOString().slice(0, 10);
  const { error: erroreScrittura } = await tabella().insert({
    user_id: userId,
    platform_key: key,
    expected_at: stimaArrivo(oggi, key),
  });
  if (erroreScrittura) {
    // 23505 = violazione dell'indice unico parziale: un'altra richiesta è stata
    // aperta nella finestra fra la lettura sopra e questo insert. È il risultato
    // che l'utente si aspetta (la richiesta è aperta), non un fallimento.
    if (erroreScrittura.code === "23505") return true;
    console.error("[import] richiesta non salvata:", erroreScrittura);
    return false;
  }
  return true;
}

/**
 * Tutte le richieste dell'utente, di qualunque stato: a differenza di
 * `richiesteAperte` (solo `requested`) non filtra, perché `/benvenuto` la usa
 * con `cardsAttesa` (`src/lib/platforms/azioni.ts`) per distinguere anche le
 * piattaforme già importate (`imported`) da quelle mai richieste (nessuna
 * riga).
 */
export async function richiesteUtente(userId: string): Promise<RichiestaImport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("import_requests" as any)
    .select("id, platform_key, requested_at, expected_at, state")
    .eq("user_id", userId);
  if (error) {
    console.error("[import] lettura richieste utente fallita:", error);
    return [];
  }
  return ((data ?? []) as unknown as RigaImportRequest[]).map(mappa);
}

/** Le richieste ancora aperte dell'utente, le più vicine ad arrivare prima. */
export async function richiesteAperte(userId: string): Promise<RichiestaImport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("import_requests" as any)
    .select("id, platform_key, requested_at, expected_at, state")
    .eq("user_id", userId)
    .eq("state", "requested")
    .order("expected_at", { ascending: true });
  if (error) {
    console.error("[import] lettura richieste aperte fallita:", error);
    return [];
  }
  return ((data ?? []) as unknown as RigaImportRequest[]).map(mappa);
}

/**
 * Chiude le richieste aperte di `keys` per l'utente: `imported`, non cancellate,
 * perché restano la prova di quando l'export è arrivato. Da chiamare quando
 * l'utente carica finalmente il file per quella piattaforma (`caricaSlug` di
 * `azioniPer`): a quel punto la richiesta ha fatto il suo lavoro e non deve più
 * comparire fra quelle aperte né generare promemoria.
 */
export async function chiudiRichieste(userId: string, keys: string[]): Promise<boolean> {
  if (keys.length === 0) return true;
  const supabase = await createClient();
  const { error } = await supabase
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from("import_requests" as any)
    .update({ state: "imported" })
    .eq("user_id", userId)
    .eq("state", "requested")
    .in("platform_key", keys);
  if (error) {
    console.error("[import] chiusura richieste fallita:", error);
    return false;
  }
  return true;
}

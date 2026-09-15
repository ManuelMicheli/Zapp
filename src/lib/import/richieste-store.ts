import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import { stimaArrivo } from "./richieste";

/**
 * Solo i campi che `richiesteUtente`/`richiesteAperte` selezionano (non l'intera
 * riga): `state` è `text` con un check constraint in DB (migration 0063), non un
 * enum Postgres, quindi il generatore lo tipizza `string`, non la nostra unione —
 * il cast in `mappa` si fida dello stesso vincolo, come già `row.source as
 * LinkSource` in `src/lib/links/resolve.ts`.
 */
type RigaImportRequest = Pick<
  Tables<"import_requests">,
  "id" | "platform_key" | "requested_at" | "expected_at" | "state"
>;

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
    state: riga.state as RichiestaImport["state"],
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
  const tabella = () => supabase.from("import_requests");

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
  if ((aperte ?? []).length > 0) return true;

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
    .from("import_requests")
    .select("id, platform_key, requested_at, expected_at, state")
    .eq("user_id", userId);
  if (error) {
    console.error("[import] lettura richieste utente fallita:", error);
    return [];
  }
  return (data ?? []).map(mappa);
}

/** Le richieste ancora aperte dell'utente, le più vicine ad arrivare prima. */
export async function richiesteAperte(userId: string): Promise<RichiestaImport[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_requests")
    .select("id, platform_key, requested_at, expected_at, state")
    .eq("user_id", userId)
    .eq("state", "requested")
    .order("expected_at", { ascending: true });
  if (error) {
    console.error("[import] lettura richieste aperte fallita:", error);
    return [];
  }
  return (data ?? []).map(mappa);
}

/**
 * Chiude le richieste aperte di `keys` per l'utente scrivendo `dismissed`, non
 * `imported` e non cancellate. Sembra al contrario — "dismissed" suona come
 * una rinuncia — ma è la scelta giusta per come la chiama oggi l'unico
 * chiamante (`confirmImport`, `src/app/(app)/import/actions.ts`): un import
 * dalla sorgente `export` chiude **tutte** le richieste aperte dell'utente,
 * non sapendo da quale piattaforma sia arrivato il file (vedi il commento
 * lì). Se scrivesse `imported`, chi ha chiesto i dati a più piattaforme e ne
 * importa una vedrebbe le card delle altre segnate "già importata" per
 * sempre — falso, e senza più un link per caricarle davvero. `dismissed`
 * ferma comunque i promemoria allo stesso modo (`prossimoPromemoria` guarda
 * solo `state === "requested"`), ma `cardsAttesa`
 * (`src/lib/platforms/azioni.ts`) la tratta come "da fare": la card resta
 * viva e cliccabile per chi deve ancora caricare l'export di quella
 * piattaforma.
 */
export async function chiudiRichieste(userId: string, keys: string[]): Promise<boolean> {
  if (keys.length === 0) return true;
  const supabase = await createClient();
  const { error } = await supabase
    .from("import_requests")
    .update({ state: "dismissed" })
    .eq("user_id", userId)
    .eq("state", "requested")
    .in("platform_key", keys);
  if (error) {
    console.error("[import] chiusura richieste fallita:", error);
    return false;
  }
  return true;
}

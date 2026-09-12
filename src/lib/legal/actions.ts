"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { CONSENSI_OBBLIGATORI, VERSIONI, type TipoConsenso } from "./versions";

const TIPI = Object.keys(VERSIONI) as TipoConsenso[];

/** Ogni Server Action è un endpoint HTTP: l'argomento lo scrive chiunque. */
function tipoValido(v: unknown): v is TipoConsenso {
  return typeof v === "string" && (TIPI as string[]).includes(v);
}

/**
 * Scrive (o riscrive) la riga di consenso: update-poi-insert, mai upsert.
 *
 * Il grant di UPDATE su `user_consents` copre solo `(granted_at, revoked_at)`
 * (migration 0043): un upsert vero genera un `on conflict do update` su **tutte**
 * le colonne del payload, quindi riscriverebbe anche `user_id`/`kind`/`version` e
 * PostgREST risponderebbe "permission denied for column" a ogni riconcessione —
 * cioè sempre, dato che la prima concessione crea la riga e ogni successiva la
 * trova già lì. Si aggiorna la riga se esiste; altrimenti si inserisce (l'insert
 * è concesso per intero). Una corsa fra le due — un'altra richiesta dello stesso
 * utente inserisce nel mezzo — fa fallire l'insert con `23505`: si rifà l'update.
 */
async function scriviConsenso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tipo: TipoConsenso,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const version = VERSIONI[tipo];
  const now = new Date().toISOString();

  const { data: aggiornata, error: erroreUpdate } = await supabase
    .from("user_consents")
    .update({ granted_at: now, revoked_at: null })
    .eq("user_id", userId)
    .eq("kind", tipo)
    .eq("version", version)
    .select("user_id")
    .maybeSingle();

  if (erroreUpdate) return { ok: false, error: erroreUpdate };
  if (aggiornata) return { ok: true };

  const { error: erroreInsert } = await supabase.from("user_consents").insert({
    user_id: userId,
    kind: tipo,
    version,
    granted_at: now,
    revoked_at: null,
  });
  if (!erroreInsert) return { ok: true };
  if (erroreInsert.code !== "23505") return { ok: false, error: erroreInsert };

  // Un'altra richiesta ha inserito la riga fra l'update e l'insert: c'è già,
  // si rifà l'update.
  const { error: erroreRetry } = await supabase
    .from("user_consents")
    .update({ granted_at: now, revoked_at: null })
    .eq("user_id", userId)
    .eq("kind", tipo)
    .eq("version", version);
  if (erroreRetry) return { ok: false, error: erroreRetry };
  return { ok: true };
}

/**
 * Registra un consenso alla versione corrente. Idempotente: riconcedere qualcosa
 * che è già attivo non crea una riga nuova, riconcedere qualcosa di revocato
 * azzera `revoked_at` sulla riga esistente (la chiave primaria è
 * `user_id, kind, version`).
 */
export async function concediConsenso(
  tipo: TipoConsenso,
): Promise<{ ok: boolean; error?: string }> {
  if (!tipoValido(tipo)) return { ok: false, error: "Richiesta non valida." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  if (!(await rateLimit(`consenso:${user.id}`, 30, 60))) {
    return { ok: false, error: "Troppe richieste. Riprova fra poco." };
  }

  const esito = await scriviConsenso(supabase, user.id, tipo);
  if (!esito.ok) {
    console.error("[legal] concessione consenso:", esito.error);
    return { ok: false, error: "Non è stato possibile salvare. Riprova." };
  }

  const esitoInterruttore = await allineaInterruttore(supabase, user.id, tipo, true);
  if (!esitoInterruttore.ok) {
    return { ok: false, error: "Non è stato possibile salvare. Riprova." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Revoca: scrive la data, non cancella la riga. */
export async function revocaConsenso(
  tipo: TipoConsenso,
): Promise<{ ok: boolean; error?: string }> {
  if (!tipoValido(tipo)) return { ok: false, error: "Richiesta non valida." };
  if (CONSENSI_OBBLIGATORI.includes(tipo)) {
    // Revocare termini o informativa significa voler smettere di usare Zapp:
    // la strada è la cancellazione dell'account, che è esplicita e completa.
    return {
      ok: false,
      error: "Per revocare termini e informativa elimina l'account dal profilo.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  const { error } = await supabase
    .from("user_consents")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("kind", tipo)
    .eq("version", VERSIONI[tipo])
    .is("revoked_at", null);

  if (error) {
    console.error("[legal] revoca consenso:", error);
    return { ok: false, error: "Non è stato possibile salvare. Riprova." };
  }

  const esitoInterruttore = await allineaInterruttore(supabase, user.id, tipo, false);
  if (!esitoInterruttore.ok) {
    // La revoca è scritta, ma la cancellazione dei dati raccolti no: non si
    // dichiara successo pieno, altrimenti l'utente crede di aver cancellato i
    // suoi dati quando sono ancora lì. Riprovare rifà anche questa parte: la
    // riga è già revocata, quindi `allineaInterruttore` è l'unica cosa che
    // resta da eseguire.
    return { ok: false, error: "Non è stato possibile salvare. Riprova." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Accettazione di termini e informativa insieme, dal passo 0 dell'onboarding. */
export async function accettaDocumenti(): Promise<{ ok: boolean; error?: string }> {
  for (const tipo of CONSENSI_OBBLIGATORI) {
    const esito = await concediConsenso(tipo);
    if (!esito.ok) return esito;
  }
  return { ok: true };
}

/**
 * `personalization_enabled` resta come interruttore rapido del profilo e come
 * colonna che il job `taste-refresh` legge. La fonte di verità è
 * `user_consents`: qui si tiene allineata, così non esistono due risposte
 * diverse alla stessa domanda.
 *
 * Spegnendo la personalizzazione si cancellano anche i dati raccolti, che è il
 * comportamento già documentato: la revoca non è "smetti di guardare", è
 * "dimentica quello che hai visto". Per questo ogni scrittura qui va controllata:
 * un errore inghiottito in silenzio lascerebbe i dati comportamentali nel
 * database mentre l'interfaccia dice che l'interruttore è spento — è
 * esattamente il caso che questa funzione esiste per evitare.
 */
async function allineaInterruttore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tipo: TipoConsenso,
  attivo: boolean,
): Promise<{ ok: boolean }> {
  if (tipo === "scrobble") return spegniScrobble(supabase, userId, attivo);
  if (tipo !== "personalization") return { ok: true };

  const { error: erroreUpsert } = await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      personalization_enabled: attivo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (erroreUpsert) {
    console.error("[legal] aggiornamento interruttore personalizzazione:", erroreUpsert);
    return { ok: false };
  }

  if (!attivo) {
    const { error: erroreEventi } = await supabase
      .from("user_events")
      .delete()
      .eq("user_id", userId);
    if (erroreEventi) {
      console.error("[legal] cancellazione user_events:", erroreEventi);
      return { ok: false };
    }

    const { error: erroreGusto } = await supabase
      .from("user_taste")
      .delete()
      .eq("user_id", userId);
    if (erroreGusto) {
      console.error("[legal] cancellazione user_taste:", erroreGusto);
      return { ok: false };
    }
  }

  return { ok: true };
}

/**
 * Revocare il consenso alla registrazione automatica **cancella le sessioni già
 * raccolte**, come per la personalizzazione: la revoca non è "smetti di
 * guardare", è "dimentica quello che hai visto".
 *
 * I dispositivi **restano collegati**. Non servono a niente finché il consenso
 * manca — `/api/scrobble` risponde 403 a ogni evento — ma riaccendendo
 * l'interruttore riprendono da soli, senza reinstallare l'estensione né rifare
 * il collegamento. Revocarli sarebbe stato più netto e più scomodo, senza
 * proteggere nessun dato in più.
 *
 * Quello che resta è la libreria: un titolo segnato come visto è un dato che
 * l'utente possiede, non telemetria, e sparisce solo se lo toglie lui.
 */
async function spegniScrobble(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  attivo: boolean,
): Promise<{ ok: boolean }> {
  if (attivo) return { ok: true };

  const { error: erroreSessioni } = await supabase
    .from("watch_sessions")
    .delete()
    .eq("user_id", userId);
  if (erroreSessioni) {
    console.error("[legal] cancellazione watch_sessions:", erroreSessioni);
    return { ok: false };
  }

  // `pending_scrobbles` ha anche righe con `user_id` nullo: eventi di un
  // dispositivo con più membri, non ancora attribuiti. Filtrare per `user_id`
  // le lascerebbe indietro, quindi si cancella per dispositivo — la policy
  // `pending_delete_own` (migration 0045) lascia passare solo quelle che
  // l'utente può già leggere.
  const { data: miei, error: erroreDispositivi } = await supabase
    .from("device_members")
    .select("device_id")
    .eq("user_id", userId);
  if (erroreDispositivi) {
    console.error("[legal] lettura dispositivi:", erroreDispositivi);
    return { ok: false };
  }

  const idDispositivi = (miei ?? []).map((m) => m.device_id);
  if (idDispositivi.length > 0) {
    const { error: erroreCoda } = await supabase
      .from("pending_scrobbles")
      .delete()
      .in("device_id", idDispositivi);
    if (erroreCoda) {
      console.error("[legal] cancellazione pending_scrobbles:", erroreCoda);
      return { ok: false };
    }
  }

  return { ok: true };
}

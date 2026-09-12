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

  const { error } = await supabase.from("user_consents").upsert(
    {
      user_id: user.id,
      kind: tipo,
      version: VERSIONI[tipo],
      granted_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "user_id,kind,version" },
  );

  if (error) {
    console.error("[legal] concessione consenso:", error);
    return { ok: false, error: "Non è stato possibile salvare. Riprova." };
  }

  await allineaInterruttore(supabase, user.id, tipo, true);
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

  await allineaInterruttore(supabase, user.id, tipo, false);
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
 * "dimentica quello che hai visto".
 */
async function allineaInterruttore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tipo: TipoConsenso,
  attivo: boolean,
): Promise<void> {
  if (tipo !== "personalization") return;
  await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      personalization_enabled: attivo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (!attivo) {
    await supabase.from("user_events").delete().eq("user_id", userId);
    await supabase.from("user_taste").delete().eq("user_id", userId);
  }
}

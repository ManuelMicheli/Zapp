"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface TicketResult {
  ok: boolean;
  error?: string;
}

/** Limiti: al massimo 10 QR per biglietto, ognuno entro 2 KB (payload opachi). */
const MAX_CODES = 10;
const MAX_CODE_LENGTH = 2048;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanCodes(codes: unknown): string[] | null {
  if (!Array.isArray(codes)) return null;
  const out: string[] = [];
  for (const c of codes) {
    if (typeof c !== "string") return null;
    const v = c.trim().slice(0, MAX_CODE_LENGTH);
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, MAX_CODES);
}

/** Il path deve stare nella cartella dell'utente e del piano: `${uid}/${planId}/<file>`. */
function validPath(path: unknown, uid: string, planId: string): path is string | null {
  if (path === null) return true;
  if (typeof path !== "string") return false;
  const re = new RegExp(`^${uid}/${planId}/[A-Za-z0-9._-]{1,80}$`);
  return re.test(path);
}

/**
 * Salva i QR letti dal biglietto (e il path dell'originale nel bucket `tickets`)
 * sul piano "Ci vado" dell'utente. Il file lo carica il browser con il client RLS;
 * qui si controlla solo che il path sia nella cartella giusta.
 */
export async function attachTicket(
  planId: string,
  input: { codes: string[]; path: string | null },
): Promise<TicketResult> {
  if (!UUID_RE.test(planId)) return { ok: false, error: "Piano non valido" };
  const codes = cleanCodes(input.codes);
  if (!codes) return { ok: false, error: "Codici non validi" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };
  if (!validPath(input.path, user.id, planId)) {
    return { ok: false, error: "File non valido" };
  }
  if (codes.length === 0 && !input.path) {
    return { ok: false, error: "Nessun biglietto da salvare" };
  }

  const { data: prev } = await supabase
    .from("cinema_plans")
    .select("ticket_path")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prev) return { ok: false, error: "Serata non trovata" };

  const { error } = await supabase
    .from("cinema_plans")
    .update({
      ticket_codes: codes,
      ticket_path: input.path,
      ticket_added_at: new Date().toISOString(),
    })
    .eq("id", planId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "Impossibile salvare il biglietto" };

  // sostituito un file precedente: via il vecchio oggetto
  if (prev.ticket_path && prev.ticket_path !== input.path) {
    await supabase.storage.from("tickets").remove([prev.ticket_path]);
  }
  revalidatePath("/");
  return { ok: true };
}

/** Toglie il biglietto dal piano e cancella l'originale dal bucket. */
export async function removeTicket(planId: string): Promise<TicketResult> {
  if (!UUID_RE.test(planId)) return { ok: false, error: "Piano non valido" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  const { data: prev } = await supabase
    .from("cinema_plans")
    .select("ticket_path")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prev) return { ok: false, error: "Serata non trovata" };

  const { error } = await supabase
    .from("cinema_plans")
    .update({ ticket_codes: [], ticket_path: null, ticket_added_at: null })
    .eq("id", planId)
    .eq("user_id", user.id);
  if (error) return { ok: false, error: "Impossibile rimuovere il biglietto" };
  if (prev.ticket_path) {
    await supabase.storage.from("tickets").remove([prev.ticket_path]);
  }
  revalidatePath("/");
  return { ok: true };
}

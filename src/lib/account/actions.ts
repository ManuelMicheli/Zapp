"use server";

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Cancellazione dell'account (art. 17 GDPR).
 *
 * La catena delle chiavi esterne è già completa — `auth.users` → `profiles` con
 * `on delete cascade`, e da lì il resto dello schema — quindi `deleteUser` svuota
 * da solo tutto Postgres. Restano fuori tre cose, e sono le tre che questo codice
 * fa a mano: i file nel bucket, i dispositivi rimasti senza membri e le loro
 * sessioni.
 */
export async function deleteAccount(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  if (!(await rateLimit(`elimina:${user.id}`, 3, 3600, { condiviso: true }))) {
    return { ok: false, error: "Troppi tentativi. Riprova più tardi." };
  }

  // Conferma: si digita il proprio nome utente. Un "sei sicuro?" si clicca per
  // riflesso; questo no.
  const conferma = String(formData.get("conferma") ?? "")
    .trim()
    .toLowerCase();
  const { data: profilo } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  if (!profilo?.username || conferma !== profilo.username.toLowerCase()) {
    return { ok: false, error: "Il nome utente non corrisponde." };
  }

  const service = createServiceClient();

  // 1. i file dei biglietti: lo storage non ha cascate.
  const { data: files } = await service.storage
    .from("tickets")
    .list(user.id, { limit: 1000 });
  if (files && files.length > 0) {
    await service.storage
      .from("tickets")
      .remove(files.map((f) => `${user.id}/${f.name}`));
  }

  // 2. i dispositivi di cui era l'unico membro. `devices.id` non ha una FK verso
  // l'utente: cancellando `device_members` resterebbero orfani per sempre.
  const { data: miei } = await service
    .from("device_members")
    .select("device_id")
    .eq("user_id", user.id);
  for (const { device_id } of miei ?? []) {
    const { count } = await service
      .from("device_members")
      .select("user_id", { count: "exact", head: true })
      .eq("device_id", device_id);
    if ((count ?? 0) <= 1) {
      await service.from("watch_sessions").delete().eq("device_id", device_id);
      await service.from("pending_scrobbles").delete().eq("device_id", device_id);
      await service.from("devices").delete().eq("id", device_id);
    }
  }

  // 3. l'utente. DEROGA CONSAPEVOLE alla regola "service client mai sui dati
  // utente": è l'unica API che cancella la riga `auth.users`, e senza quella
  // l'account resterebbe in piedi. È accettabile perché l'id viene dalla sessione
  // verificata qui sopra e non è mai un parametro del client, perché tocca solo
  // questo utente, e perché è l'ultima istruzione dopo tutti i controlli.
  const { error } = await service.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] cancellazione:", error);
    return { ok: false, error: "Non è stato possibile eliminare l'account. Riprova." };
  }

  await supabase.auth.signOut();
  redirect("/addio");
}

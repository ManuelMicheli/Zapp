"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { isIntInRange, isUuid } from "@/lib/validate";

/** Un'ora, il minimo e il massimo per "metti in pausa". */
const PAUSE_HOURS_MIN = 0;
const PAUSE_HOURS_MAX = 168;

/**
 * Crea il dispositivo "questo browser" e restituisce il token **una volta
 * sola**: il server ne conserva solo l'hash (`token_hash`). La pagina lo
 * passa all'estensione via `chrome.runtime.sendMessage`, poi lo dimentica.
 *
 * `devices` e `device_members` non hanno grant di insert per `authenticated`
 * (migration 0033): il service client scrive per conto del dispositivo, non
 * al posto dell'utente, che comunque deve avere una sessione valida.
 */
export async function connectBrowser(): Promise<
  { ok: true; token: string; deviceId: string } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  if (!(await rateLimit(`devices:connect:${user.id}`, 10, 60))) {
    return { ok: false, error: "Troppi tentativi, riprova fra poco" };
  }

  const token = `zc_${randomBytes(32).toString("base64url")}`;
  const service = createServiceClient();

  const { data: device, error } = await service
    .from("devices")
    .insert({
      install_id: randomUUID(),
      token_hash: createHash("sha256").update(token).digest("hex"),
      name: "Questo browser",
      platform: "browser_ext",
    })
    .select("id")
    .single();

  if (error || !device) {
    console.error("[devices] insert", error?.message);
    return { ok: false, error: "Non è stato possibile collegare il browser" };
  }

  const { error: memberError } = await service
    .from("device_members")
    .insert({ device_id: device.id, user_id: user.id });

  if (memberError) {
    console.error("[devices] member", memberError.message);
    return { ok: false, error: "Non è stato possibile collegare il browser" };
  }

  revalidatePath("/devices");
  return { ok: true, token, deviceId: device.id };
}

/** Un nome dispositivo va da 1 a 60 caratteri, dopo `trim()`. */
const DEVICE_NAME_MAX = 60;

/**
 * L'app nativa (guscio Expo) si abbina da sola come dispositivo: la pagina
 * web, loggata nella WebView, chiama questa azione e passa il token al
 * guscio. `install_id` (generato dal guscio, stabile per installazione) è la
 * chiave di idempotenza: una reinstallazione con lo stesso `install_id`
 * aggiorna la riga esistente invece di crearne una doppia, con un nuovo
 * `token_hash` (il vecchio token smette di funzionare). Il token torna al
 * chiamante una volta sola: il server conserva solo l'hash.
 *
 * Un telefono è personale, non condiviso come la TV in modalità famiglia:
 * chi si riabbina su un `install_id` esistente sostituisce ogni altro membro,
 * non si aggiunge a loro. `installId` va trattato come un segreto (mai in
 * log, mai in URL): è la chiave con cui si prende il dispositivo.
 */
export async function pairOwnDevice(input: {
  platform: "ios" | "android";
  installId: string; // uuid generato dal guscio, stabile per installazione
  name: string; // es. "iPhone di Manuel", 1..60 caratteri
}): Promise<
  { ok: true; token: string; deviceId: string } | { ok: false; error: string }
> {
  if (typeof input !== "object" || input === null) {
    return { ok: false, error: "Richiesta non valida" };
  }
  const { platform, installId, name } = input;
  if (platform !== "ios" && platform !== "android") {
    return { ok: false, error: "Richiesta non valida" };
  }
  if (!isUuid(installId)) {
    return { ok: false, error: "Richiesta non valida" };
  }
  const nomeDispositivo = typeof name === "string" ? name.trim() : "";
  if (nomeDispositivo.length < 1 || nomeDispositivo.length > DEVICE_NAME_MAX) {
    return { ok: false, error: "Richiesta non valida" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Non autenticato" };

  if (!(await rateLimit(`devices:pair:${user.id}`, 10, 60))) {
    return { ok: false, error: "Troppi tentativi, riprova fra poco" };
  }

  const token = `zc_${randomBytes(32).toString("base64url")}`;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const service = createServiceClient();

  const { data: esistente, error: findError } = await service
    .from("devices")
    .select("id")
    .eq("install_id", installId)
    .maybeSingle();
  if (findError) {
    console.error("[devices] pairOwnDevice", findError.message);
    return { ok: false, error: "Non è stato possibile collegare il dispositivo" };
  }

  let deviceId: string;
  if (esistente) {
    const { error: updateError } = await service
      .from("devices")
      .update({
        token_hash: tokenHash,
        name: nomeDispositivo,
        platform,
        revoked_at: null,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", esistente.id);
    if (updateError) {
      console.error("[devices] pairOwnDevice", updateError.message);
      return { ok: false, error: "Non è stato possibile collegare il dispositivo" };
    }
    deviceId = esistente.id;

    // Un telefono è personale: chi si riabbina adesso è l'unico membro, non
    // uno in più accanto a chi c'era prima (a differenza della TV in
    // modalità famiglia, dove più persone restano abbinate insieme).
    const { error: purgeError } = await service
      .from("device_members")
      .delete()
      .eq("device_id", deviceId)
      .neq("user_id", user.id);
    if (purgeError) {
      console.error("[devices] pairOwnDevice", purgeError.message);
      return { ok: false, error: "Non è stato possibile collegare il dispositivo" };
    }
  } else {
    const { data: device, error: insertError } = await service
      .from("devices")
      .insert({
        install_id: installId,
        token_hash: tokenHash,
        name: nomeDispositivo,
        platform,
      })
      .select("id")
      .single();
    if (insertError || !device) {
      console.error("[devices] pairOwnDevice", insertError?.message);
      return { ok: false, error: "Non è stato possibile collegare il dispositivo" };
    }
    deviceId = device.id;
  }

  const { error: memberError } = await service
    .from("device_members")
    .upsert(
      { device_id: deviceId, user_id: user.id },
      { onConflict: "device_id,user_id", ignoreDuplicates: true },
    );
  if (memberError) {
    console.error("[devices] pairOwnDevice", memberError.message);
    return { ok: false, error: "Non è stato possibile collegare il dispositivo" };
  }

  revalidatePath("/devices");
  return { ok: true, token, deviceId };
}

/**
 * "Sta funzionando?": vero appena il dispositivo ha mandato il suo primo
 * evento riconosciuto (una riga in `watch_sessions`). La pagina di
 * collegamento la interroga finché non arriva, così l'utente vede la
 * conferma invece di restare nel dubbio — il fallimento peggiore è il
 * successo silenzioso.
 */
export async function firstEventSeen(
  deviceId: string,
): Promise<{ seen: boolean; title: string | null }> {
  if (!isUuid(deviceId)) return { seen: false, title: null };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { seen: false, title: null };

  // la RLS su watch_sessions lascia vedere solo le proprie righe
  // (watch_sessions_select_own): il controllo di proprietà è comunque anche
  // qui nel codice, non solo nella policy.
  const { data, error } = await supabase
    .from("watch_sessions")
    .select("title_id, media_type, titles(title)")
    .eq("device_id", deviceId)
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // un errore vero qui non deve sembrare "non ancora visto" nei log: verso
    // il client il comportamento resta lo stesso ("non ancora"), ma la causa
    // deve restare rintracciabile.
    console.error("[devices] firstEventSeen", error.message);
  }

  const titolo =
    (data as { titles?: { title?: string } | null } | null)?.titles?.title ?? null;
  return { seen: Boolean(data), title: titolo };
}

/**
 * Scollega il dispositivo per l'utente corrente. Se resta senza membri, il
 * dispositivo è revocato (il service client scrive `revoked_at`: la riga
 * `devices` non è scrivibile da `authenticated`).
 */
export async function disconnectDevice(deviceId: string): Promise<{ ok: boolean }> {
  if (!isUuid(deviceId)) return { ok: false };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  // il controllo di proprietà si fa anche nel codice, non solo nella RLS
  const { error, count: rimosse } = await supabase
    .from("device_members")
    .delete({ count: "exact" })
    .eq("device_id", deviceId)
    .eq("user_id", user.id);
  if (error) {
    console.error("[devices] disconnect", error.message);
    return { ok: false };
  }

  // Nessuna riga cancellata = l'utente non era membro di questo dispositivo
  // (id altrui, o già scollegato altrove): senza questo controllo, la scrittura
  // di sistema qui sotto contava solo i membri rimasti, non se il chiamante
  // fosse mai stato uno di loro — un `deviceId` non proprio, capitato senza
  // membri attivi per altre ragioni, veniva comunque revocato dal service
  // client.
  if (!rimosse) return { ok: false };

  const service = createServiceClient();
  const { count } = await service
    .from("device_members")
    .select("device_id", { count: "exact", head: true })
    .eq("device_id", deviceId);
  if ((count ?? 0) === 0) {
    await service
      .from("devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", deviceId);
  }

  revalidatePath("/devices");
  return { ok: true };
}

/**
 * Mette in pausa (o riprende, `hours = 0`) l'ascolto per l'utente corrente.
 * Solo `paused_until` è scrivibile da `authenticated` (grant per colonna,
 * migration 0033): non c'è modo di toccare `device_id`/`user_id` da qui.
 */
export async function pauseDevice(
  deviceId: string,
  hours: number,
): Promise<{ ok: boolean }> {
  if (!isUuid(deviceId) || !isIntInRange(hours, PAUSE_HOURS_MIN, PAUSE_HOURS_MAX)) {
    return { ok: false };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const until =
    hours === 0 ? null : new Date(Date.now() + hours * 3_600_000).toISOString();
  // il controllo di proprietà si fa anche nel codice, non solo nella RLS
  const { error } = await supabase
    .from("device_members")
    .update({ paused_until: until })
    .eq("device_id", deviceId)
    .eq("user_id", user.id);
  if (error) {
    console.error("[devices] pause", error.message);
    return { ok: false };
  }

  revalidatePath("/devices");
  return { ok: true };
}

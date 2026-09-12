"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { isIntInRange, isMediaType, isTmdbId, isUuid } from "@/lib/validate";
import { isCodiceValido, normalizzaCodice } from "@/lib/devices/pairing";
import { formaDiLancio, PROVIDER_LANCIABILI } from "@/lib/devices/launch";

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

/**
 * Reclama il codice mostrato da una TV. Il grosso lo fa la RPC, che e'
 * `security definer` perche' `pairing_codes` e' chiusa a tutti.
 */
export async function claimPairingCode(
  code: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const pulito = normalizzaCodice(String(code ?? ""));
  if (!isCodiceValido(pulito)) {
    return { ok: false, error: "Codice non valido." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  if (!(await rateLimit(`claim:${user.id}`, 10, 60, { condiviso: true }))) {
    return { ok: false, error: "Troppi tentativi, riprova fra un minuto." };
  }

  // Il codice e' di sei cifre e vive dieci minuti: da solo, un tetto per utente
  // non basta, perche' chi ha molti account moltiplica i tentativi. Due tetti in
  // piu', ciascuno contro un gioco diverso:
  //
  // - **per codice**: chi martella *quel* codice si ferma dopo cinque tentativi,
  //   e non importa da quanti account arrivi. Chi ha il codice davanti agli occhi
  //   lo sbaglia una volta, non cinque.
  // - **per indirizzo**: chi spara a caso cambia bersaglio a ogni tentativo, e il
  //   tetto per codice non lo vedrebbe mai. Venti al minuto sono larghi per una
  //   persona che digita e stretti per chi enumera.
  //
  // Resta scoperto solo chi ha molti account **e** molti indirizzi: a quel punto
  // la leva e' la lunghezza del codice, che pero' peggiora l'unica cosa che
  // l'utente deve fare a mano. Scelta consapevole, non dimenticanza.
  if (!(await rateLimit(`claim-code:${pulito}`, 5, 600, { condiviso: true }))) {
    return { ok: false, error: "Codice non valido o scaduto." };
  }
  const indirizzo = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if (
    indirizzo &&
    !(await rateLimit(`claim-ip:${indirizzo}`, 20, 60, { condiviso: true }))
  ) {
    return { ok: false, error: "Troppi tentativi, riprova fra un minuto." };
  }

  const { data, error } = await supabase.rpc("claim_pairing_code", { p_code: pulito });
  if (error) {
    console.error("claimPairingCode", error);
    return { ok: false, error: "Codice non valido o scaduto." };
  }

  revalidatePath("/devices");
  const nome = (data as { name?: string } | null)?.name ?? "TV";
  return { ok: true, name: nome };
}

/** Vita del comando: oltre, non ha piu' senso eseguirlo. */
const COMANDO_TTL_MS = 2 * 60 * 1000;

/**
 * Chiede a una TV collegata di aprire un titolo.
 *
 * Non scrive niente in libreria: il lancio **dichiara**, non registra. Cio' che
 * finisce in libreria arriva dalla riproduzione vera, oltre i due minuti, come
 * per ogni altra sorgente.
 */
export async function lanciaSullaTv(input: {
  deviceId: string;
  titleId: number;
  mediaType: "movie" | "tv";
  providerId: number;
}): Promise<
  | { ok: true; commandId: string; esito: "avvia" | "scheda" | "app"; nome: string }
  | { ok: false; error: string }
> {
  const { deviceId, titleId, mediaType, providerId } = input;
  if (!isUuid(deviceId) || !isTmdbId(titleId) || !isMediaType(mediaType)) {
    return { ok: false, error: "Richiesta non valida." };
  }
  if (!PROVIDER_LANCIABILI.includes(providerId)) {
    return { ok: false, error: "Questa piattaforma non si apre sulla TV." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessione scaduta." };

  if (!(await rateLimit(`lancia:${user.id}`, 20, 60, { condiviso: true }))) {
    return { ok: false, error: "Troppi lanci, riprova fra un minuto." };
  }

  // Il controllo di proprieta' si fa anche nel codice, non solo nella RLS.
  const { data: membro, error: membroError } = await supabase
    .from("device_members")
    .select("device_id, devices!inner(name, revoked_at)")
    .eq("device_id", deviceId)
    .eq("user_id", user.id)
    .maybeSingle();
  // Si logga anche se la risposta all'utente resta la stessa negazione: un
  // deviceId non proprio e un database che non risponde arrivano qui allo
  // stesso modo, ma solo il secondo e' un guasto da vedere nei log.
  if (membroError) console.error("[tv] membro", membroError.message);
  const device = membro?.devices;
  if (!membro || !device || device.revoked_at !== null) {
    return { ok: false, error: "Questa TV non e' collegata." };
  }

  // Il link viene dalla cache dei link, mai dal client: e' un intent che
  // un'altra macchina eseguira'.
  const service = createServiceClient();
  const { data: link, error: linkError } = await service
    .from("title_provider_links")
    .select("url")
    .eq("title_id", titleId)
    .eq("media_type", mediaType)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (linkError) console.error("[tv] link", linkError.message);

  const forma = formaDiLancio(providerId, link?.url ?? null);
  if (!forma) return { ok: false, error: "Di questo titolo non ho il link giusto." };

  const { data: riga, error } = await supabase
    .from("device_commands")
    .insert({
      device_id: deviceId,
      created_by: user.id,
      title_id: titleId,
      media_type: mediaType,
      provider_id: providerId,
      packages: forma.packages,
      data_uri: forma.dataUri,
      extra_deeplink: forma.extraDeeplink,
      esito_atteso: forma.esito,
      expires_at: new Date(Date.now() + COMANDO_TTL_MS).toISOString(),
    })
    .select("id")
    .single();

  if (error || !riga) {
    console.error("[tv] lancio", error?.message);
    return { ok: false, error: "Non sono riuscito a parlare con la TV." };
  }
  return {
    ok: true,
    commandId: riga.id,
    esito: forma.esito,
    nome: device.name,
  };
}

/** La TV ha ritirato il comando? Serve al bottone per smettere di girare. */
export async function esitoComando(
  commandId: string,
): Promise<{ delivered: boolean; result: string | null }> {
  if (!isUuid(commandId)) return { delivered: false, result: null };
  const supabase = await createClient();
  const { data } = await supabase
    .from("device_commands")
    .select("delivered_at, result")
    .eq("id", commandId)
    .maybeSingle();
  return { delivered: !!data?.delivered_at, result: data?.result ?? null };
}

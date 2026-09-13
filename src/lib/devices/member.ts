import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * L'unico utente attivo di un dispositivo collegato.
 *
 * Il bearer del dispositivo dice *quale telefono* sta chiamando, non *chi*: e'
 * `device_members` a dirlo. Per le rotte che **scrivono** (gli intent di Siri)
 * un dispositivo con due membri non basta: "ho visto Dark" andrebbe scritto in
 * una libreria a caso fra le due, e l'errore non sarebbe nemmeno visibile a chi
 * l'ha causato. Quindi si scrive solo quando il dispositivo ha **un** membro
 * attivo e uno solo; negli altri casi la rotta risponde e non tocca niente.
 *
 * "Attivo" esclude chi ha messo in pausa il collegamento (`paused_until` nel
 * futuro, la pausa della pagina Dispositivi): in pausa il dispositivo non deve
 * scrivere niente per lui — ed e' anche il modo in cui due coinquilini possono
 * far funzionare Siri su un telefono condiviso, mettendo in pausa l'altro.
 *
 * Service client: `device_members` e' leggibile da `authenticated` solo per le
 * proprie righe, e qui di sessione non ce n'e' nessuna (eccezione motivata,
 * vedi `security.md`: si legge una riga di sistema per risalire all'utente gia'
 * autenticato dal token del dispositivo, non dati di un utente qualunque).
 */
export async function soleActiveMember(
  deviceId: string,
): Promise<{ userId: string } | { error: "condiviso" | "nessuno" | "db" }> {
  const { data, error } = await createServiceClient()
    .from("device_members")
    .select("user_id, paused_until")
    .eq("device_id", deviceId)
    // Un tetto c'e' comunque: i membri di un dispositivo sono pochi (la
    // famiglia), e un numero fuori scala vorrebbe dire tutt'altro problema.
    .limit(50);

  if (error) {
    // Mai l'id del dispositivo nei log insieme all'errore: basta il messaggio.
    console.error("[devices/member] lettura membri", error.message);
    return { error: "db" };
  }

  // La pausa si filtra **qui**, non dentro un `.or()` col timestamp interpolato
  // nella stringa del filtro: dentro `or()` il valore fa parte della grammatica
  // di PostgREST (regola di `security.md`), e un `paused_until.lt.<ISO>` — con i
  // due punti dell'ora dentro — non escludeva affatto la riga in pausa. Era
  // passato inosservato perche' fallisce "al sicuro" solo per caso: un membro in
  // pausa contato come attivo rende il dispositivo "condiviso" invece di
  // lasciarlo funzionare. Il confronto in JavaScript non ha grammatica da
  // rispettare e si legge per quello che e'.
  const adesso = Date.now();
  const attivi = (data ?? []).filter(
    (m) => m.paused_until === null || Date.parse(m.paused_until) < adesso,
  );

  if (attivi.length === 0) return { error: "nessuno" };
  if (attivi.length > 1) return { error: "condiviso" };
  return { userId: attivi[0].user_id };
}

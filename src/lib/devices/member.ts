import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

/**
 * L'unico utente di un dispositivo collegato.
 *
 * Il bearer del dispositivo dice *quale telefono* sta chiamando, non *chi*: e'
 * `device_members` a dirlo. Per le rotte che **scrivono** (gli intent di Siri)
 * un dispositivo con due membri non basta: "ho visto Dark" andrebbe scritto in
 * una libreria a caso fra le due, e l'errore non sarebbe nemmeno visibile a chi
 * l'ha causato. Quindi si scrive solo quando il dispositivo ha **un** membro e
 * uno solo; negli altri casi la rotta risponde e non tocca niente.
 *
 * `paused_until` **non conta qui**: e' la pausa dell'ascolto scrobble (pagina
 * Dispositivi, "non guardare quello che faccio su questo telefono"), non una
 * dichiarazione su chi sta parlando a Siri in questo momento. Un comando vocale
 * e' un'azione deliberata di chi lo pronuncia, non un'osservazione passiva come
 * lo scrobble: filtrarla qui vorrebbe dire che mettere in pausa lo scrobble
 * cambia anche chi puo' usare gli intent, un effetto collaterale che la pagina
 * Dispositivi non promette. Su iOS il caso "due membri" e' comunque raro:
 * `pairOwnDevice` cancella ogni membro diverso da chi si abbina, quindi un
 * telefono ne ha sempre e solo uno — il 409 sotto resta raggiungibile solo
 * quando il dispositivo non ha ancora nessun membro (mai abbinato, o abbinato
 * e poi rimosso).
 *
 * Service client: `device_members` e' leggibile da `authenticated` solo per le
 * proprie righe, e qui di sessione non ce n'e' nessuna (eccezione motivata in
 * `CLAUDE.md`: si legge una riga di sistema per risalire all'utente gia'
 * autenticato dal token del dispositivo, non dati di un utente qualunque).
 */
export async function soleActiveMember(
  deviceId: string,
): Promise<{ userId: string } | { error: "unresolved" | "db" }> {
  const { data, error } = await createServiceClient()
    .from("device_members")
    .select("user_id")
    .eq("device_id", deviceId)
    // Un tetto c'e' comunque: i membri di un dispositivo sono pochi (la
    // famiglia), e un numero fuori scala vorrebbe dire tutt'altro problema.
    .limit(50);

  if (error) {
    // Mai l'id del dispositivo nei log insieme all'errore: basta il messaggio.
    console.error("[devices/member] lettura membri", error.message);
    return { error: "db" };
  }

  const membri = data ?? [];
  if (membri.length !== 1) return { error: "unresolved" };
  return { userId: membri[0].user_id };
}

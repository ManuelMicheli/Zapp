/**
 * I testi delle notifiche push.
 *
 * Non ne inventa nessuno: sono gli stessi dello `switch` di
 * `src/app/(app)/notifications/page.tsx`, appiattiti (il push non ha grassetti
 * né JSX) e con lo stesso ripiego quando manca il titolo. Se un giorno una
 * frase cambia lì, va cambiata anche qui: sono la stessa notifica vista da due
 * parti, e vederne due versioni diverse sullo stesso telefono è peggio che non
 * riceverla affatto.
 *
 * Modulo puro: nessun import, niente database, niente rete. Si collauda con
 * Vitest e lo chiama `fanout.ts`, che gli passa i nomi già risolti.
 */

export type PushMessage = { title: string; body: string; path: string };

/**
 * Come si chiama, in italiano, il contenuto nascosto (DSA art. 16). Copia
 * della mappa `COSA` della pagina: è di quattro righe, e importarla da un
 * componente React trascinerebbe mezza app dentro un modulo puro.
 */
const COSA: Record<string, string> = {
  review: "La tua recensione",
  title_comment: "Il tuo commento",
  comment: "Il tuo commento",
  daily_answer: "La tua risposta",
};

/**
 * Percorso della scheda titolo, solo se il payload lo permette davvero: l'id
 * dev'essere un intero positivo e il tipo uno dei due che esistono. Un push
 * apre l'app su quel percorso senza che nessuno lo guardi, quindi qui non si
 * concatena niente che non sia stato controllato.
 */
function titlePath(payload: Record<string, unknown>): string | null {
  const id = payload.title_id;
  const tipo = payload.media_type;
  if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) return null;
  if (tipo !== "movie" && tipo !== "tv") return null;
  return `/title/${tipo}/${id}`;
}

/**
 * Da una riga di `notifications` al messaggio push, o `null` se quel `kind`
 * non si spinge (tipi nuovi compresi: meglio nessun push che un push muto).
 * `nomi` arriva già risolto da `fanout.ts` — il mittente e il titolo citato.
 */
export function composePush(
  kind: string,
  payload: Record<string, unknown>,
  nomi: { fromUser?: string; titolo?: string },
): PushMessage | null {
  const nome = nomi.fromUser ?? "Qualcuno";
  const titolo = nomi.titolo;
  const percorso = titlePath(payload);

  switch (kind) {
    case "friend_request":
      return {
        title: "Nuova richiesta di amicizia",
        body: `${nome} ti ha inviato una richiesta di amicizia`,
        path: "/friends",
      };
    case "friend_accepted":
      // La pagina apre `/u/<username>`: il payload della notifica non ha lo
      // username, e una query in più solo per il link non vale il ritardo.
      return {
        title: "Amicizia accettata",
        body: `${nome} ha accettato la tua richiesta`,
        path: "/friends",
      };
    case "recommendation":
      return {
        title: "Un consiglio per te",
        body: titolo
          ? `${nome} ti ha consigliato ${titolo}`
          : `${nome} ti ha consigliato un titolo`,
        path: percorso ?? "/",
      };
    case "like":
      return {
        title: "Mi piace",
        body: titolo
          ? `${nome} ha messo mi piace alla tua attività su ${titolo}`
          : `${nome} ha messo mi piace a una tua attività`,
        path: percorso ?? "/friends",
      };
    case "comment":
      return {
        title: "Nuovo commento",
        body: titolo
          ? `${nome} ha commentato la tua recensione di ${titolo}`
          : `${nome} ha commentato la tua recensione`,
        path: "/",
      };
    case "content_hidden": {
      const cosa =
        COSA[typeof payload.target_type === "string" ? payload.target_type : ""] ??
        "Un tuo contenuto";
      return {
        title: "Contenuto non più visibile",
        body: titolo
          ? `${cosa} su ${titolo} non è più visibile: ha ricevuto tre segnalazioni.`
          : `${cosa} non è più visibile: ha ricevuto tre segnalazioni.`,
        path: percorso ?? "/",
      };
    }
    case "report_outcome":
      return {
        title: "Segnalazione accolta",
        body: titolo
          ? `Abbiamo accolto la tua segnalazione: il contenuto su ${titolo} non è più visibile.`
          : "Abbiamo accolto la tua segnalazione: il contenuto non è più visibile.",
        path: percorso ?? "/",
      };
    default:
      return null;
  }
}

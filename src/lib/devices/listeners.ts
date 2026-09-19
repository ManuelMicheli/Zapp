/**
 * I comandi che concedono a un'app TV l'**accesso alle notifiche**, cioe' il
 * prerequisito di `MediaSessionManager.getActiveSessions` e quindi del
 * riconoscimento automatico di cosa si sta guardando.
 *
 * Su Fire OS la schermata di sistema per quel permesso **non esiste** e adbd non
 * serve i chiamanti locali (misurato il 12/09/2026): l'unica via e' `adb` da un
 * computer sulla stessa rete. Zapp e' una pagina web e non puo' parlare adb, per
 * cui qui si compongono soltanto le righe da incollare in un terminale.
 *
 * La ragione per cui questo sta in una funzione e non in tre righe di
 * documentazione: `settings put secure enabled_notification_listeners`
 * **sostituisce l'intero elenco**. Passato a voce, quel comando spegne il
 * permesso alle altre app del televisore. Qui l'elenco vecchio si legge prima e
 * il nostro servizio si accoda.
 */

/** Le due app TV di Zapp e il servizio da abilitare per ciascuna. */
export const ASCOLTATORI = {
  "zapp-tv": {
    etichetta: "Zapp TV",
    componente: "com.zapp.tv/com.zapp.tv.ascolto.ZListener",
  },
  zconnection: {
    etichetta: "ZConnection TV",
    componente: "com.zapp.zconnection/com.zapp.zconnection.ZListener",
  },
} as const;

export type AppTv = keyof typeof ASCOLTATORI;

export type Sistema = "windows" | "unix";

/**
 * `pkg/.Classe` e `pkg/pkg.Classe` sono lo stesso servizio: Android espande il
 * punto iniziale con il nome del pacchetto (`ComponentName.unflattenFromString`,
 * che e' il confronto usato dalle app). Senza questa espansione un elenco gia'
 * corretto sembrerebbe privo del servizio e lo scriveremmo due volte.
 */
function espandi(voce: string): string {
  const taglio = voce.indexOf("/");
  if (taglio < 0) return voce;
  const pacchetto = voce.slice(0, taglio);
  const classe = voce.slice(taglio + 1);
  return classe.startsWith(".") ? `${pacchetto}/${pacchetto}${classe}` : voce;
}

/**
 * L'elenco da scrivere: quello letto dalla TV con il nostro servizio in fondo.
 *
 * `vecchio` e' l'uscita grezza di `settings get`, incollata da un terminale:
 * puo' essere `null`, vuota, con virgolette, `\r` di Windows o separatori doppi.
 */
export function componiElenco(vecchio: string, componente: string): string {
  const grezzo = vecchio
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
  const voci =
    grezzo === "" || grezzo.toLowerCase() === "null"
      ? []
      : grezzo
          .split(":")
          .map((voce) => voce.trim())
          .filter((voce) => voce !== "");

  const atteso = espandi(componente);
  if (voci.some((voce) => espandi(voce) === atteso)) return voci.join(":");
  return [...voci, componente].join(":");
}

/** L'IPv4 scritto dall'utente, ripulito; `null` se non e' un IPv4. */
export function normalizzaIp(valore: string): string | null {
  const pulito = valore.trim();
  const pezzi = pulito.split(".");
  if (pezzi.length !== 4) return null;
  const numeri = pezzi.map((pezzo) => {
    if (!/^\d{1,3}$/.test(pezzo)) return -1;
    return Number(pezzo);
  });
  if (numeri.some((numero) => numero < 0 || numero > 255)) return null;
  return numeri.join(".");
}

/**
 * Se l'indirizzo e' di una rete locale. Un indirizzo pubblico qui vuol dire
 * quasi sempre che si e' copiato l'IP sbagliato: la pagina lo dice invece di
 * mandare qualcuno a bussare su un computer altrui.
 */
export function eIndirizzoPrivato(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

export type Comandi = {
  connetti: string;
  leggi: string;
  scrivi: string;
  verifica: string;
  disconnetti: string;
};

/**
 * Le righe da incollare, nell'ordine in cui si eseguono.
 *
 * Ogni comando porta `-s <ip>:5555`: se al computer e' attaccato anche un
 * telefono in debug, un `adb shell` senza `-s` fallisce o — peggio — riscrive
 * l'elenco degli ascoltatori del telefono.
 */
export function comandi(
  sistema: Sistema,
  ip: string,
  componente: string,
  elencoLetto: string,
): Comandi {
  const adb = sistema === "windows" ? ".\\adb" : "./adb";
  const bersaglio = `${ip}:5555`;
  const su = `${adb} -s ${bersaglio}`;
  const chiave = "settings get secure enabled_notification_listeners";
  return {
    connetti: `${adb} connect ${bersaglio}`,
    leggi: `${su} shell ${chiave}`,
    scrivi: `${su} shell settings put secure enabled_notification_listeners "${componiElenco(elencoLetto, componente)}"`,
    verifica: `${su} shell ${chiave}`,
    disconnetti: `${adb} disconnect ${bersaglio}`,
  };
}

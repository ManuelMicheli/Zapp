/**
 * Protocollo del ponte fra il sito e il **guscio nativo** (app Expo con
 * `react-native-webview`, che carica il sito dentro una WebView).
 *
 * Due direzioni, due trasporti:
 * - **web → nativo**: `window.ReactNativeWebView.postMessage(JSON.stringify(msg))`
 * - **nativo → web**: il guscio inietta JS che fa
 *   `window.dispatchEvent(new CustomEvent(NATIVE_EVENT, { detail: msg }))`
 *
 * Il messaggio attraversa un confine di fiducia: arriva come JSON qualunque e
 * va **validato a mano**, campo per campo. Mai un cast: `as NativeToWeb` qui
 * significherebbe fidarsi di una stringa che il tipo non ha mai controllato.
 *
 * **Questo file ha una copia gemella nel repo mobile, in
 * `src/bridge/protocol.ts`, byte per byte.** Per questo è puro: nessun import,
 * nessuna dipendenza, niente alias `@/`. **Se cambi qui, cambi là**: due copie
 * che divergono sono un ponte che si rompe solo in produzione, e solo sulle
 * versioni dell'app già installate.
 */

export type NativePlatform = "ios" | "android";

/** Quello che il guscio manda alla pagina. */
export type NativeToWeb =
  | {
      type: "ready";
      platform: NativePlatform;
      version: string;
      installId: string;
      /** Nome del dispositivo letto dal sistema (`expo-device`), se c'è. */
      deviceName?: string;
    }
  | { type: "pushToken"; token: string }
  | { type: "sharedContent"; url?: string; text?: string }
  | { type: "deepLink"; path: string };

/** Quello che la pagina manda al guscio. */
export type WebToNative =
  | { type: "deviceToken"; token: string; deviceId: string }
  | { type: "openExternal"; url: string }
  | { type: "badge"; count: number }
  | { type: "signedOut" };

/** Nome dell'evento DOM su cui il guscio consegna i messaggi alla pagina. */
export const NATIVE_EVENT = "zapp:native";

/** ` ZappMobile/1.2.3 (ios)`: versione e piattaforma dichiarate dal guscio. */
const UA_RE = / ZappMobile\/[0-9][0-9A-Za-z.+-]{0,39} \((ios|android)\)/;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lunghezza massima di un campo libero: oltre, è un abuso, non un messaggio. */
const TESTO_MAX = 2000;
const VERSION_MAX = 40;
const TOKEN_MAX = 200;
/** Come `devices.name` lato server: 1..60 caratteri dopo `trim()`. */
const DEVICE_NAME_MAX = 60;

/** Riconosce il guscio dal suo user-agent (` ZappMobile/1.2.3 (ios)`). */
export function isNativeShell(ua: string): boolean {
  return typeof ua === "string" && UA_RE.test(ua);
}

/** Piattaforma dichiarata nello user-agent del guscio, o null. */
export function nativePlatformFromUa(ua: string): NativePlatform | null {
  if (typeof ua !== "string") return null;
  const match = UA_RE.exec(ua);
  if (!match) return null;
  return match[1] === "ios" ? "ios" : "android";
}

/** Vero per un percorso interno sicuro: inizia con "/" ma non con "//", niente schema. */
export function isInternalPath(path: string): boolean {
  // "//evil.test" è protocol-relative: il browser ci vede un altro host.
  // "\\" lo stesso, perché i browser normalizzano la barra rovesciata.
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\")
  );
}

/** Stringa non vuota entro `max` caratteri. */
function stringa(valore: unknown, max: number): string | null {
  if (typeof valore !== "string") return null;
  if (valore.length < 1 || valore.length > max) return null;
  return valore;
}

/** Valida a mano un messaggio nativo→web; null se non conforme. Mai cast. */
export function parseNativeMessage(raw: unknown): NativeToWeb | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const msg: Record<string, unknown> = { ...raw };

  switch (msg.type) {
    case "ready": {
      const platform = msg.platform;
      if (platform !== "ios" && platform !== "android") return null;
      const version = stringa(msg.version, VERSION_MAX);
      if (version === null) return null;
      // l'installId è un segreto (è la chiave con cui ci si prende il
      // dispositivo): una forma sbagliata non va nemmeno provata sul server.
      if (typeof msg.installId !== "string" || !UUID_RE.test(msg.installId)) return null;
      // Il nome è un di più: se manca, non è una stringa o non sta nei limiti
      // si lascia cadere il campo, non il messaggio. Un `ready` buttato via
      // per colpa del nome vorrebbe dire un dispositivo mai abbinato; senza
      // nome la pagina mette comunque il suo ripiego.
      const nome = typeof msg.deviceName === "string" ? msg.deviceName.trim() : "";
      const deviceName =
        nome.length >= 1 && nome.length <= DEVICE_NAME_MAX ? nome : undefined;
      return deviceName === undefined
        ? { type: "ready", platform, version, installId: msg.installId }
        : { type: "ready", platform, version, installId: msg.installId, deviceName };
    }
    case "pushToken": {
      const token = stringa(msg.token, TOKEN_MAX);
      return token === null ? null : { type: "pushToken", token };
    }
    case "sharedContent": {
      let url: string | undefined;
      if (msg.url !== undefined) {
        const valore = stringa(msg.url, TESTO_MAX);
        // solo http(s): "javascript:" e "data:" qui sarebbero un'iniezione
        if (valore === null) return null;
        if (!valore.startsWith("https://") && !valore.startsWith("http://")) return null;
        url = valore;
      }
      let text: string | undefined;
      if (msg.text !== undefined) {
        const valore = stringa(msg.text, TESTO_MAX);
        if (valore === null) return null;
        text = valore;
      }
      if (url === undefined && text === undefined) return null;
      return url === undefined
        ? { type: "sharedContent", text }
        : text === undefined
          ? { type: "sharedContent", url }
          : { type: "sharedContent", url, text };
    }
    case "deepLink": {
      const path = stringa(msg.path, TESTO_MAX);
      if (path === null || !isInternalPath(path)) return null;
      return { type: "deepLink", path };
    }
    default:
      return null;
  }
}

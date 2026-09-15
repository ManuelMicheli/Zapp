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

/** Una TV vista sulla rete locale. `zapp` la si puo' toccare, `firetv` no. */
export type TvTrovata = {
  kind: "zapp" | "firetv";
  name: string;
  host: string;
  port?: number;
  installId?: string;
};

/** Perche' un abbinamento vicino non e' andato a buon fine. */
export type MotivoTv = "rifiutato" | "scaduto" | "occupato" | "rete" | "permesso";

/** Quello che il guscio manda alla pagina. */
export type NativeToWeb =
  | {
      type: "ready";
      platform: NativePlatform;
      version: string;
      installId: string;
      /** Nome del dispositivo letto dal sistema (`expo-device`), se c'è. */
      deviceName?: string;
      /** Id di questo dispositivo, cosi' la pagina sa quale TV e' "questo telefono". */
      deviceId?: string;
    }
  | { type: "pushToken"; token: string }
  | { type: "sharedContent"; url?: string; text?: string }
  | { type: "deepLink"; path: string }
  | { type: "scrobbleStatus"; granted: boolean }
  | { type: "tvFound"; devices: TvTrovata[] }
  | { type: "tvConsent"; installId: string }
  | { type: "tvError"; motivo: MotivoTv };

/** Quello che la pagina manda al guscio. */
export type WebToNative =
  | { type: "deviceToken"; token: string; deviceId: string }
  | { type: "openExternal"; url: string }
  | { type: "badge"; count: number }
  | { type: "signedOut" }
  | { type: "openSettings"; which: "notificationListener" }
  | { type: "discoverTv"; action: "start" | "stop" }
  | { type: "connectTv"; host: string; port: number; name: string; deviceId: string };

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

/** Oltre sedici TV in una casa non e' un elenco, e' un abuso. */
const TV_MAX = 16;

// Ogni ottetto e' "0" o comincia per 1-9: uno zero davanti (es. "192.168.1.01")
// e' un IPv4 non canonico che un parser a valle in stile inet_aton legge come
// ottale ("01" = 1, ma "010" = 8), un bypass della guardia sotto.
const IPV4_RE =
  /^(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/;

/**
 * Vero solo per un IPv4 privato o link-local, in forma canonica (niente zeri
 * davanti in un ottetto: sarebbero ottale per un parser in stile inet_aton).
 *
 * Il guscio dice alla pagina dove ha trovato una TV, e la pagina dice al guscio
 * a chi connettersi: se passasse un indirizzo pubblico, una pagina compromessa
 * potrebbe usare il telefono per bussare a un server qualsiasi.
 */
export function isIndirizzoPrivato(valore: unknown): valore is string {
  if (typeof valore !== "string") return false;
  const m = IPV4_RE.exec(valore);
  if (!m) return false;
  const ottetti = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (ottetti.some((o) => o > 255)) return false;
  const [a, b] = ottetti;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

const MOTIVI_TV: readonly string[] = [
  "rifiutato",
  "scaduto",
  "occupato",
  "rete",
  "permesso",
];

/** Una TV dell'elenco, o null se un solo campo non e' conforme. */
function tvTrovata(valore: unknown): TvTrovata | null {
  if (typeof valore !== "object" || valore === null || Array.isArray(valore)) return null;
  const v = valore as Record<string, unknown>;
  if (v.kind !== "zapp" && v.kind !== "firetv") return null;
  const name = stringa(v.name, DEVICE_NAME_MAX);
  if (name === null) return null;
  if (!isIndirizzoPrivato(v.host)) return null;

  const tv: TvTrovata = { kind: v.kind, name, host: v.host };
  if (v.port !== undefined) {
    if (typeof v.port !== "number" || !Number.isInteger(v.port)) return null;
    if (v.port < 1 || v.port > 65535) return null;
    tv.port = v.port;
  }
  if (v.installId !== undefined) {
    if (typeof v.installId !== "string" || !UUID_RE.test(v.installId)) return null;
    tv.installId = v.installId;
  }
  return tv;
}

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
      const ready: Extract<NativeToWeb, { type: "ready" }> = {
        type: "ready",
        platform,
        version,
        installId: msg.installId,
      };
      // Il nome è un di più: se manca, non è una stringa o non sta nei limiti
      // si lascia cadere il campo, non il messaggio. Un `ready` buttato via
      // per colpa del nome vorrebbe dire un dispositivo mai abbinato; senza
      // nome la pagina mette comunque il suo ripiego.
      const nome = typeof msg.deviceName === "string" ? msg.deviceName.trim() : "";
      if (nome.length >= 1 && nome.length <= DEVICE_NAME_MAX) ready.deviceName = nome;
      // Stesso trattamento del nome: deviceId serve solo perché la pagina
      // riconosca "questo telefono" fra le TV elencate, quindi una forma
      // sbagliata fa cadere il campo, non tutto il ready.
      if (typeof msg.deviceId === "string" && UUID_RE.test(msg.deviceId)) {
        ready.deviceId = msg.deviceId;
      }
      return ready;
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
    case "scrobbleStatus": {
      const granted = msg.granted;
      if (typeof granted !== "boolean") return null;
      return { type: "scrobbleStatus", granted };
    }
    case "tvFound": {
      if (!Array.isArray(msg.devices) || msg.devices.length > TV_MAX) return null;
      const devices: TvTrovata[] = [];
      for (const grezza of msg.devices) {
        const tv = tvTrovata(grezza);
        // Una riga malformata butta il messaggio intero: un elenco meta' buono
        // e meta' no non e' un elenco di cui fidarsi.
        if (tv === null) return null;
        devices.push(tv);
      }
      return { type: "tvFound", devices };
    }
    case "tvConsent": {
      if (typeof msg.installId !== "string" || !UUID_RE.test(msg.installId)) return null;
      return { type: "tvConsent", installId: msg.installId };
    }
    case "tvError": {
      if (typeof msg.motivo !== "string" || !MOTIVI_TV.includes(msg.motivo)) return null;
      return { type: "tvError", motivo: msg.motivo as MotivoTv };
    }
    default:
      return null;
  }
}

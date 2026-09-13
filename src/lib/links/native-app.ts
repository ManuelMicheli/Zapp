/**
 * Apertura nella **app nativa** della piattaforma, non nel suo sito.
 *
 * Netflix, Prime Video & co. reindirizzano da soli il browser sulla propria app,
 * quindi un `<a href="https://…" target="_blank">` basta. Disney+ no: la pagina
 * `disneyplus.com/browse/entity-…` si apre e resta nel browser. Due rimedi, uno
 * per sistema, entrambi sul link https che abbiamo già (nessun ID in più):
 *
 * - **Android**: `intent://…#Intent;package=com.disney.disneyplus;…;end`. Chrome
 *   consegna l'intent al pacchetto indicato senza passare dalla verifica degli
 *   App Links, e `S.browser_fallback_url` riporta al sito chi non ha l'app.
 * - **iOS**: gli universal link di Disney+ coprono `/browse/*` (verificato sul
 *   loro `apple-app-site-association`, 2026-09-09), ma dentro una PWA in
 *   standalone `target="_blank"` apre una scheda del browser in-app, che all'app
 *   nativa non cede mai. Serve una navigazione **top-level**: allora iOS
 *   riconosce l'universal link e passa la mano all'app.
 *
 * Dentro il **guscio nativo** (l'app Expo, vedi `src/lib/native/protocol.ts`)
 * il ragionamento non serve e sarebbe dannoso: una WebView che naviga su
 * disneyplus.com resta una WebView, e all'app non cede mai. Lì ogni link https
 * torna al guscio, che lo apre fuori; l'handoff lo fa il sistema operativo.
 *
 * Il modulo è puro (test in `native-app.test.ts`): la scelta la applica
 * `src/components/ui/AppLink.tsx`.
 */

import { isNativeShell } from "@/lib/native/protocol";

interface NativeApp {
  /** Nome del pacchetto Android, per l'intent esplicito. */
  androidPackage: string;
}

/**
 * Solo le piattaforme che *non* si aprono da sole. Aggiungerne una qui cambia il
 * comportamento di ogni bottone "Apri"/"Continua": prima va verificato che il
 * link https attuale resti davvero nel browser.
 */
export const NATIVE_APPS: Record<number, NativeApp> = {
  337: { androidPackage: "com.disney.disneyplus" }, // Disney+
};

export function isAndroidUa(ua: string): boolean {
  return /Android/i.test(ua) && !/Windows/i.test(ua);
}

export function isIosUa(ua: string): boolean {
  // iPad in "modalità desktop" si dichiara Macintosh: lo si riconosce dal touch,
  // che qui non abbiamo; resta il caso raro e cade sul comportamento normale.
  return /iPhone|iPad|iPod/i.test(ua);
}

/**
 * URL `intent://` verso il pacchetto della piattaforma, con ritorno al sito.
 * `null` se la piattaforma non è fra quelle da forzare o l'URL non è https.
 */
export function androidIntentUrl(url: string, providerId: number): string | null {
  const pkg = NATIVE_APPS[providerId]?.androidPackage;
  if (!pkg) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  // il frammento dell'URL non entra: dopo `#` comincia la grammatica dell'intent
  const target = `${parsed.host}${parsed.pathname}${parsed.search}`;
  const fallback = encodeURIComponent(url);
  return `intent://${target}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${fallback};end`;
}

export type OpenMode =
  /** Link normale: nuova scheda, come per tutte le altre piattaforme. */
  | "default"
  /** Navigazione verso l'intent Android (l'app, o il sito come ripiego). */
  | "android-intent"
  /** Navigazione top-level sullo stesso URL https, perché iOS ceda all'app. */
  | "ios-top-level"
  /** Il guscio apre l'URL fuori dalla WebView: l'handoff all'app lo fa il sistema. */
  | "native-shell";

/**
 * Come aprire il link di una piattaforma su questo dispositivo.
 * `url` relativo (`/go/…`, che risolve al volo) resta un link normale: la
 * destinazione vera non la conosciamo ancora.
 */
export function nativeOpen({
  url,
  providerId,
  ua,
}: {
  url: string;
  providerId: number | null | undefined;
  ua: string;
}): { mode: OpenMode; href: string } {
  const plain = { mode: "default" as const, href: url };
  // Nel guscio decide il guscio, e vale per ogni piattaforma (non solo per
  // quelle di NATIVE_APPS): un https se ne va fuori dalla WebView, un
  // relativo resta un link normale perché `/go/…` risolve prima sul server e
  // solo dopo il guscio intercetta la navigazione esterna.
  if (isNativeShell(ua)) {
    return url.startsWith("https://") ? { mode: "native-shell", href: url } : plain;
  }
  if (providerId == null || !NATIVE_APPS[providerId]) return plain;
  if (
    providerId === 337 &&
    isIosUa(ua) &&
    (/^\/go\/(movie|tv)\/\d{1,10}\/337\?play=1$/.test(url) ||
      /^\/play\/movie\/\d{1,10}\/337$/.test(url) ||
      /^\/play\/tv\/\d{1,10}\/337\?season=[1-9]\d{0,2}&episode=[1-9]\d{0,3}$/.test(
        url,
      ))
  )
    return { mode: "ios-top-level", href: url };
  if (!url.startsWith("https://")) return plain;
  if (isAndroidUa(ua)) {
    const intent = androidIntentUrl(url, providerId);
    return intent ? { mode: "android-intent", href: intent } : plain;
  }
  if (isIosUa(ua)) return { mode: "ios-top-level", href: url };
  return plain;
}

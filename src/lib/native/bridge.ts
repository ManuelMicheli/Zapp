/**
 * Lato web del ponte con il guscio nativo: i due trasporti descritti in
 * `protocol.ts`, e nient'altro. Fuori dal guscio ogni funzione è innocua —
 * `postToNative` torna `false` senza effetti, `onNativeMessage` ascolta un
 * evento che nessuno emetterà — così chi chiama non deve controllare prima.
 *
 * Modulo di solo client (tocca `window`), ma senza `"use client"`: la direttiva
 * sta sul componente che lo usa. Non importa nulla di server-only.
 */

import {
  NATIVE_EVENT,
  parseNativeMessage,
  type NativeToWeb,
  type WebToNative,
} from "./protocol";

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(data: string): void };
  }
}

/** Vero se la pagina gira dentro il guscio (window.ReactNativeWebView presente). */
export function inNativeShell(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.ReactNativeWebView?.postMessage === "function"
  );
}

/** Manda un messaggio al guscio. Falso (e nessun effetto) fuori dal guscio. */
export function postToNative(msg: WebToNative): boolean {
  if (!inNativeShell()) return false;
  window.ReactNativeWebView?.postMessage(JSON.stringify(msg));
  return true;
}

/**
 * L'ultimo `ready` visto da questo modulo, per chi si monta dopo.
 *
 * `ready` è un messaggio di **caricamento**: il guscio lo manda alla fine del
 * caricamento della WebView, una volta sola. Ma a `/devices` si arriva con la
 * navigazione soft dell'App Router, quindi un componente di pagina può nascere
 * molto dopo l'ultimo `ready` e non vederne più nessuno — restando senza
 * `deviceId` per sempre. Tenerne una copia qui è il modo per servirlo anche a
 * chi arriva tardi, senza toccare il protocollo.
 *
 * Vive quanto il modulo: un caricamento vero della pagina la azzera, ed è
 * giusto così, perché il `ready` successivo arriva subito dopo.
 */
let ultimoReady: Extract<NativeToWeb, { type: "ready" }> | null = null;

/** L'ultimo `ready` ricevuto, o null se non ne è ancora passato nessuno. */
export function lastNativeReady(): Extract<NativeToWeb, { type: "ready" }> | null {
  return ultimoReady;
}

/** Ascolta i messaggi del guscio. Ritorna la funzione per smettere. */
export function onNativeMessage(handler: (m: NativeToWeb) => void): () => void {
  if (typeof window === "undefined") return () => {};
  function ascolta(event: Event) {
    // `detail` arriva dal guscio come JSON qualunque: passa dal parser, che
    // valida campo per campo. Quello che non è conforme si ignora in silenzio.
    const msg = parseNativeMessage((event as CustomEvent).detail);
    if (!msg) return;
    if (msg.type === "ready") ultimoReady = msg;
    handler(msg);
  }
  window.addEventListener(NATIVE_EVENT, ascolta);
  return () => window.removeEventListener(NATIVE_EVENT, ascolta);
}

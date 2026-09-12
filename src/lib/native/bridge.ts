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

/** Ascolta i messaggi del guscio. Ritorna la funzione per smettere. */
export function onNativeMessage(handler: (m: NativeToWeb) => void): () => void {
  if (typeof window === "undefined") return () => {};
  function ascolta(event: Event) {
    // `detail` arriva dal guscio come JSON qualunque: passa dal parser, che
    // valida campo per campo. Quello che non è conforme si ignora in silenzio.
    const msg = parseNativeMessage((event as CustomEvent).detail);
    if (msg) handler(msg);
  }
  window.addEventListener(NATIVE_EVENT, ascolta);
  return () => window.removeEventListener(NATIVE_EVENT, ascolta);
}

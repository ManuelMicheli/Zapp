"use client";

import { AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { PreviewPayload } from "@/app/api/preview/[mediaType]/[id]/route";
import { previewPlacement, previewWidth } from "@/lib/preview/position";

const PreviewCard = dynamic(
  () => import("./PreviewCard").then((module) => module.PreviewCard),
  { ssr: false },
);

/** Stessa stima di PreviewCard, tenuta qui per non caricare il player su mobile. */
const heightGuess = (width: number) => Math.round((width * 9) / 16) + 210;

/** Permanenza del mouse sulla copertina prima che la scheda si apra. */
const OPEN_DELAY_MS = 600;
/** Tempo per passare dalla copertina alla scheda senza che si chiuda. */
const CLOSE_GRACE_MS = 150;

/** Href già chiesti in questa sessione: il secondo passaggio apre senza attese. */
const cache = new Map<string, PreviewPayload>();

interface OpenState {
  href: string;
  /** Copertina di partenza: allo scroll la scheda la insegue. */
  el: HTMLElement;
  anchor: DOMRect;
  data: PreviewPayload;
}

/**
 * Anteprima al passaggio del mouse sulle copertine della home (solo desktop).
 *
 * Avvolge il contenuto della home e ascolta un solo `pointerover` sul documento:
 * le copertine si dichiarano con `data-preview="<href della scheda>"` (prop `preview`
 * di `PosterCard`), quindi non serve rendere client gli scaffali, che restano
 * componenti server. La scheda vive in un **portal** su `body`: dentro lo scaffale,
 * che è `overflow-x-auto`, verrebbe tagliata.
 *
 * Niente di tutto questo su telefono e tablet: senza `(hover: hover)`,
 * `(pointer: fine)` e 1024px di larghezza il layer non aggancia nemmeno l'ascoltatore.
 */
export function PreviewLayer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenState | null>(null);
  const [width, setWidth] = useState(() => previewWidth(1440));
  const [height, setHeight] = useState(() => heightGuess(previewWidth(1440)));
  const [allowVideo, setAllowVideo] = useState(true);
  /** Il portal esiste solo dal mount: sul server non c'è `document.body`. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<AbortController>(undefined);
  /** Href attualmente aperto o in arrivo: evita di riaprire la stessa scheda. */
  const currentHref = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    openTimer.current = undefined;
    closeTimer.current = undefined;
  }, []);

  const close = useCallback(() => {
    clearTimers();
    pending.current?.abort();
    pending.current = undefined;
    currentHref.current = null;
    setOpen(null);
  }, [clearTimers]);

  useEffect(() => {
    const desktop = window.matchMedia(
      "(min-width: 1024px) and (hover: hover) and (pointer: fine)",
    );
    if (!desktop.matches) return;

    const quiet =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches || saveData();
    setAllowVideo(!quiet);

    async function show(el: HTMLElement, href: string) {
      const size = previewWidth(window.innerWidth);
      const cached = cache.get(href);
      if (cached) {
        setWidth(size);
        setHeight(heightGuess(size));
        setOpen({ href, el, anchor: el.getBoundingClientRect(), data: cached });
        return;
      }
      const api = apiPath(href);
      if (!api) return;
      const controller = new AbortController();
      pending.current = controller;
      try {
        const res = await fetch(api, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as PreviewPayload;
        cache.set(href, data);
        // il mouse può essere già andato altrove mentre arrivava la risposta
        if (currentHref.current !== href) return;
        setWidth(size);
        setHeight(heightGuess(size));
        setOpen({ href, el, anchor: el.getBoundingClientRect(), data });
      } catch {
        // richiesta annullata o rete giù: nessuna scheda, nessun errore in pagina
      }
    }

    function onPointerOver(event: PointerEvent) {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest) return;

      // dentro la scheda: resta aperta
      if (target.closest("[data-preview-card]")) {
        clearTimeout(closeTimer.current);
        closeTimer.current = undefined;
        return;
      }

      const el = target.closest<HTMLElement>("[data-preview]");
      const href = el?.dataset.preview;
      if (el && href) {
        clearTimeout(closeTimer.current);
        closeTimer.current = undefined;
        if (currentHref.current === href) return;
        clearTimeout(openTimer.current);
        pending.current?.abort();
        openTimer.current = setTimeout(() => {
          currentHref.current = href;
          void show(el, href);
        }, OPEN_DELAY_MS);
        return;
      }

      // fuori da tutto: si annulla l'apertura in attesa e si chiude con un attimo
      // di grazia, il tempo di passare dalla copertina alla scheda
      clearTimeout(openTimer.current);
      openTimer.current = undefined;
      if (!currentHref.current || closeTimer.current) return;
      closeTimer.current = setTimeout(close, CLOSE_GRACE_MS);
    }

    // Il mouse che esce dalla pagina (barra del browser, altro schermo) non genera
    // nessun `pointerover`: senza questo la scheda restava aperta. `relatedTarget`
    // nullo = il puntatore ha lasciato il documento, quindi si chiude subito.
    function onPointerOut(event: PointerEvent) {
      if (event.pointerType && event.pointerType !== "mouse") return;
      if (event.relatedTarget) return;
      close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }

    // Lo scroll sposta la copertina e la scheda la insegue, invece di chiudersi: in
    // home il carosello in testa scorre da solo ogni 4 secondi, e chiudere a ogni
    // evento di scroll faceva sparire l'anteprima mentre la si stava guardando.
    // Si chiude solo quando la copertina esce davvero dallo schermo.
    let queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        setOpen((current) => {
          if (!current) return current;
          const anchor = current.el.getBoundingClientRect();
          if (anchor.bottom <= 0 || anchor.top >= window.innerHeight) {
            currentHref.current = null;
            return null;
          }
          return { ...current, anchor };
        });
      });
    }

    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      clearTimers();
    };
  }, [close, clearTimers]);

  const place =
    open &&
    previewPlacement({
      anchor: open.anchor,
      width,
      height,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });

  return (
    <>
      {children}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && place && (
              <PreviewCard
                key={open.href}
                data={open.data}
                width={width}
                left={place.left}
                top={place.top}
                allowVideo={allowVideo}
                onMeasure={setHeight}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/** `/title/movie/123` → `/api/preview/movie/123`. */
function apiPath(href: string): string | null {
  const match = /^\/title\/(movie|tv)\/(\d+)$/.exec(href);
  return match ? `/api/preview/${match[1]}/${match[2]}` : null;
}

function saveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection;
  return connection?.saveData === true;
}

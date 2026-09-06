"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

/**
 * Vista a tutto schermo del biglietto: fondo bianco, un QR per schermata (scorri
 * in orizzontale se sono più di uno), codice sotto in piccolo, link all'originale.
 * `urls` sono le immagini già generate da `TicketQr`; con `codes` vuoto mostra solo
 * l'originale (nessun QR letto). Chiusura con il bottone o Escape.
 */
export function QrFullscreen({
  open,
  onClose,
  codes,
  urls,
  initialIndex = 0,
  originalUrl,
}: {
  open: boolean;
  onClose: () => void;
  codes: string[];
  urls: string[];
  initialIndex?: number;
  originalUrl: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    // porta in vista il QR toccato
    const el = scroller.current;
    if (el) el.scrollTo({ left: el.clientWidth * initialIndex });
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, initialIndex]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Biglietto"
      className="fixed inset-0 z-[60] flex flex-col bg-white text-black"
    >
      <div className="flex items-center justify-between px-5 pb-2 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        <p className="text-[15px] font-semibold">
          {codes.length > 1 ? `${codes.length} biglietti` : "Il tuo biglietto"}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="flex size-10 items-center justify-center rounded-full bg-black/[0.06]"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {codes.length > 0 ? (
        <div
          ref={scroller}
          className="scrollbar-none flex flex-1 snap-x snap-mandatory overflow-x-auto"
        >
          {codes.map((code, i) => (
            <div
              key={code}
              className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-4 px-6"
            >
              {urls[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL generata in locale
                <img
                  src={urls[i]}
                  alt={`QR biglietto ${i + 1}`}
                  className="aspect-square w-[min(88vw,480px)]"
                />
              ) : (
                <span className="aspect-square w-[min(88vw,480px)] rounded-lg bg-black/5" />
              )}
              <p className="max-w-[min(88vw,480px)] break-all text-center font-mono text-[11px] text-black/60">
                {code}
              </p>
              {codes.length > 1 && (
                <p className="text-[13px] text-black/50">
                  {i + 1} di {codes.length} · scorri
                </p>
              )}
            </div>
          ))}
        </div>
      ) : originalUrl ? (
        <div className="flex flex-1 items-center justify-center overflow-auto px-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmato del bucket privato */}
          <img
            src={originalUrl}
            alt="Biglietto originale"
            className="max-h-full max-w-full"
          />
        </div>
      ) : null}

      {originalUrl && codes.length > 0 && (
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-3 text-center">
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener"
            className="text-[14px] font-semibold text-black/70 underline underline-offset-4"
          >
            Vedi l&apos;originale
          </a>
        </div>
      )}
    </div>,
    document.body,
  );
}

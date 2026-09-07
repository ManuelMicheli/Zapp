"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ui/Toaster";
import { cleanSeatInput } from "@/lib/cinema/seats";
import { setSeats } from "@/lib/cinema/tickets";
import { Icon } from "./icons";

/**
 * "Sono qui": la schermata da mostrare all'addetto all'ingresso. Fondo nero, **solo
 * i QR**, uno per schermata (niente codice, niente titoli: la maschera bianca attorno
 * al QR è quella che serve allo scanner), avanti e indietro con le frecce o scorrendo;
 * l'ultima schermata dice i posti letti dal biglietto, o li fa scrivere. Tiene lo
 * schermo acceso finché è aperta (Wake Lock, dove c'è).
 */
export function ScanMode({
  open,
  onClose,
  planId,
  codes,
  urls,
  seats,
  hall,
}: {
  open: boolean;
  onClose: () => void;
  planId: string;
  codes: string[];
  /** Immagini dei QR già generate da `useQrImages`. */
  urls: string[];
  seats: string[];
  hall: string | null;
}) {
  const { show } = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState<string[] | null>(null);

  // l'ultima schermata sono i posti: una in più dei QR
  const slides = codes.length + 1;
  const shown = saved ?? seats;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // `go` legge solo i ref: non serve nelle dipendenze
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, slides]);

  // schermo sempre acceso mentre si è in fila alla cassa
  useEffect(() => {
    if (!open) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    const lock = (
      navigator as Navigator & {
        wakeLock?: {
          request: (t: "screen") => Promise<{ release: () => Promise<void> }>;
        };
      }
    ).wakeLock;
    lock
      ?.request("screen")
      .then((s) => {
        sentinel = s;
      })
      .catch(() => {});
    return () => {
      void sentinel?.release().catch(() => {});
    };
  }, [open]);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  function go(delta: number) {
    const el = scroller.current;
    if (!el) return;
    const next = Math.min(
      slides - 1,
      Math.max(0, Math.round(el.scrollLeft / el.clientWidth) + delta),
    );
    el.scrollTo({ left: el.clientWidth * next, behavior: "smooth" });
    setIndex(next);
  }

  function saveSeats() {
    const list = cleanSeatInput(draft);
    if (list.length === 0) return;
    startTransition(async () => {
      const r = await setSeats(planId, list, hall);
      if (!r.ok) {
        show(r.error ?? "Errore");
        return;
      }
      setSaved(list);
    });
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Biglietto da scansionare"
      className="fixed inset-0 z-[70] flex flex-col bg-black text-white"
    >
      <div className="flex items-center justify-between px-5 pb-1 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
        <span className="text-[13px] font-semibold text-white/55 tabular-nums">
          {index < codes.length
            ? `${index + 1} di ${codes.length}`
            : shown.length > 0
              ? "I tuoi posti"
              : "Dove sei seduto"}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="flex size-10 items-center justify-center rounded-full bg-white/10"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
        className="scrollbar-none flex flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {codes.map((code, i) => (
          <div
            key={code}
            className="flex w-full shrink-0 snap-center items-center justify-center px-5"
          >
            {urls[i] ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL generata in locale
              <img
                src={urls[i]}
                alt={`QR biglietto ${i + 1}`}
                className="aspect-square w-[min(86vw,520px)] rounded-2xl bg-white p-3"
              />
            ) : (
              <span className="aspect-square w-[min(86vw,520px)] rounded-2xl bg-white/10" />
            )}
          </div>
        ))}

        <div className="flex w-full shrink-0 snap-center flex-col items-center justify-center gap-5 px-8 text-center">
          {shown.length > 0 ? (
            <>
              {hall && (
                <p className="text-[15px] font-semibold uppercase tracking-[0.18em] text-white/50">
                  {hall}
                </p>
              )}
              <div className="flex flex-col gap-3">
                {shown.map((seat) => (
                  <p
                    key={seat}
                    className="text-[34px] font-light leading-tight tracking-[-0.03em]"
                  >
                    {seat}
                  </p>
                ))}
              </div>
              <p className="text-[13px] text-white/45">Buona visione</p>
            </>
          ) : (
            <>
              <p className="text-[20px] font-semibold">Dove sei seduto?</p>
              <p className="max-w-[320px] text-[14px] text-white/55">
                Sul biglietto non ho trovato i posti: scrivili qui e li ritrovi ogni volta
                che apri questa schermata.
              </p>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Fila G Posto 12, Fila G Posto 13"
                aria-label="I tuoi posti"
                className="w-full max-w-[340px] rounded-[14px] bg-white/10 px-4 py-3 text-center text-[16px] placeholder:text-white/35"
              />
              <button
                type="button"
                onClick={saveSeats}
                disabled={pending || draft.trim() === ""}
                className="h-11 rounded-full bg-white px-6 text-[15px] font-semibold text-black disabled:opacity-40"
              >
                Salva i posti
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-3">
        <Arrow dir={-1} disabled={index === 0} onClick={() => go(-1)} />
        <div className="flex gap-1.5">
          {Array.from({ length: slides }, (_, i) => (
            <span
              key={i}
              className={`size-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/25"}`}
            />
          ))}
        </div>
        <Arrow dir={1} disabled={index === slides - 1} onClick={() => go(1)} />
      </div>
    </div>,
    document.body,
  );
}

function Arrow({
  dir,
  disabled,
  onClick,
}: {
  dir: 1 | -1;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 1 ? "Avanti" : "Indietro"}
      className="flex size-11 items-center justify-center rounded-full bg-white/10 disabled:opacity-25"
    >
      <span className={dir === -1 ? "rotate-180" : ""}>
        <Icon name="chev" size={18} />
      </span>
    </button>
  );
}

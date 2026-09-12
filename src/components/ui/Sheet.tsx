"use client";

import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { createPortal } from "react-dom";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Bottom sheet per le azioni. Chiusura con tap sul backdrop o swipe down.
 * Reso in portale su `document.body`: così i suoi z-index (40/50) non restano
 * intrappolati in eventuali stacking context dei genitori (es. `isolate`).
 */
export function Sheet({
  open,
  onClose,
  children,
  title,
  size = "auto",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** `tall` = fino a ~90% dello schermo, contenuto scorrevole (foglio biglietto). */
  size?: "auto" | "tall";
  className?: string;
}) {
  // in SSR non esiste `document`: si monta solo dopo l'idratazione
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Lo swipe che chiude il foglio parte solo dalla maniglia: dentro c'è spesso una
  // lista che scorre (i comuni, il biglietto) e con il drag su tutto il pannello
  // scorrerla lo trascinava giù fino a chiuderlo.
  const drag = useDragControls();

  // Col foglio aperto scorre il foglio, non la pagina dietro.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const prev = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // La tastiera del telefono non sposta un `position: fixed` ancorato in basso: su
  // iOS il foglio resta al fondo della pagina, cioè *dietro* alla tastiera, e il
  // campo appena messo a fuoco sparisce. Il fondo vero è quello del
  // `visualViewport`: il foglio si alza di quella differenza.
  const [keyboard, setKeyboard] = useState(0);
  const [viewport, setViewport] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!open || !vv) return;
    const measure = () => {
      const inset = window.innerHeight - (vv.height + vv.offsetTop);
      // meno di così è la barra del browser che si ritrae, non una tastiera
      const kb = inset > 80 ? Math.round(inset) : 0;
      setKeyboard(kb);
      setViewport(kb ? Math.round(vv.height) : 0);
    };
    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      setKeyboard(0);
      setViewport(0);
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            style={{
              ...(keyboard ? { bottom: keyboard } : null),
              // con la tastiera aperta lo schermo utile è il `visualViewport`, non `svh`
              ...(viewport ? { maxHeight: viewport - 12 } : null),
            }}
            className={`pb-safe fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-[480px] flex-col rounded-t-[32px] border-t border-white/10 bg-sheet px-4 pt-3.5 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] ${
              size === "tall" ? "max-h-[min(90svh,900px)]" : "max-h-[88svh]"
            } ${className ?? ""}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={0.05}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80) onClose();
            }}
          >
            <div
              onPointerDown={(e) => drag.start(e)}
              className="cursor-grab touch-none active:cursor-grabbing"
            >
              <div className="mx-auto mb-4 h-[5px] w-9 rounded-full bg-white/[0.18]" />
              {title && <p className="mb-3 text-center text-sm font-semibold">{title}</p>}
            </div>
            <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto pb-6">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

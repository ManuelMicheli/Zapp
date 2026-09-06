"use client";

import { AnimatePresence, motion } from "framer-motion";
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
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  /** `tall` = ~90% dello schermo, contenuto scorrevole (foglio biglietto). */
  size?: "auto" | "tall";
}) {
  // in SSR non esiste `document`: si monta solo dopo l'idratazione
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

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
            className={`pb-safe fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] rounded-t-[32px] border-t border-white/10 bg-sheet px-4 pt-3.5 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] ${
              size === "tall" ? "flex h-[min(90svh,900px)] flex-col" : ""
            }`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.05}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80) onClose();
            }}
          >
            <div className="mx-auto mb-4 h-[5px] w-9 rounded-full bg-white/[0.18]" />
            {title && <p className="mb-3 text-center text-sm font-semibold">{title}</p>}
            <div
              className={
                size === "tall"
                  ? "scrollbar-none min-h-0 flex-1 overflow-y-auto pb-6"
                  : "pb-6"
              }
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

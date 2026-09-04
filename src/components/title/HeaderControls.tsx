"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useShare } from "./ShareButton";

/** Stato audio del trailer esposto da `CinematicBackdrop`: `null` finché non è in riproduzione. */
export interface SoundControl {
  on: boolean;
  toggle: () => void;
}

const BUTTON_CLASS =
  "flex size-10 shrink-0 items-center justify-center rounded-full text-text transition-colors hover:bg-white/10 active:bg-white/15";

const ICON_PROPS = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

/**
 * Pillola in vetro con i comandi del fondale, un solo blocco ordinato invece di cerchi
 * sparsi. Non si posiziona da sola: `CinematicBackdrop` la monta (portal) nello slot
 * `[data-header-controls]` della testata, che sotto `lg` sta fuori dal video. Audio del trailer (compare, con una piccola
 * animazione, solo quando il trailer è visibile) e Condividi (solo scheda titolo).
 * Stessa quota del bottone Indietro (safe-area + 92px dal bordo della testata).
 */
export function HeaderControls({
  shareTitle,
  sound,
}: {
  /** Titolo da condividere; assente nella pagina stagione. */
  shareTitle?: string;
  sound: SoundControl | null;
}) {
  const share = useShare(shareTitle ?? "");
  if (!shareTitle && !sound) return null;

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="glass flex h-10 items-center overflow-hidden rounded-full"
    >
      <AnimatePresence initial={false}>
        {sound && (
          <motion.div
            key="sound"
            layout
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.25 }}
            className="flex items-center"
          >
            <button
              type="button"
              aria-label={
                sound.on ? "Disattiva audio del trailer" : "Attiva audio del trailer"
              }
              aria-pressed={sound.on}
              onClick={sound.toggle}
              className={BUTTON_CLASS}
            >
              <svg {...ICON_PROPS}>
                <path d="M11 5 6 9H3v6h3l5 4z" />
                {sound.on ? (
                  <>
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                  </>
                ) : (
                  <path d="m16 9 5 6M21 9l-5 6" />
                )}
              </svg>
            </button>
            {shareTitle && <span aria-hidden className="h-5 w-px bg-white/15" />}
          </motion.div>
        )}
      </AnimatePresence>

      {shareTitle && (
        <button
          type="button"
          aria-label="Condividi"
          onClick={() => void share()}
          className={BUTTON_CLASS}
        >
          <svg {...ICON_PROPS}>
            <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
            <path d="M16 6l-4-4-4 4" />
            <path d="M12 2v13" />
          </svg>
        </button>
      )}
    </motion.div>
  );
}

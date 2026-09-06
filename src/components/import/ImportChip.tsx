"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useImport } from "./ImportProvider";

/** Quanto resta visibile il chip a import finito. */
const DONE_VISIBLE_MS = 8000;

/**
 * Chip di avanzamento dell'import Netflix: sopra la nav (in basso su mobile, in alto
 * da lg), barra + conteggio; a fine import mostra l'esito con il link alla libreria
 * e sparisce da solo.
 */
export function ImportChip() {
  const { job, dismiss } = useImport();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (!job?.finished) return;
    const t = setTimeout(dismiss, DONE_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [job?.finished, dismiss]);

  const pct = job && job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  // il riconoscimento è la prima delle due fasi, la scrittura parte da sola
  const phaseLabel = job?.phase === "match" ? "Riconoscimento" : "Importazione";
  const doneLabel = job
    ? [
        `${job.written} titoli importati`,
        job.skipped > 0 ? `${job.skipped} già presenti` : null,
        job.unmatched > 0 ? `${job.unmatched} non riconosciuti` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <AnimatePresence>
      {job && (
        <motion.div
          key="import-chip"
          role="status"
          aria-live="polite"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
          className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+var(--nav-bottom)+14px)] z-40 flex justify-center px-5 lg:bottom-auto lg:top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+12px)]"
        >
          <div className="glass-strong pointer-events-auto flex w-full max-w-[420px] items-center gap-3 rounded-full py-2 pl-4 pr-2">
            <div className="min-w-0 flex-1">
              {job.finished ? (
                <p className="truncate text-[13px] font-semibold">
                  {job.error ?? doneLabel}
                </p>
              ) : (
                <>
                  <p className="truncate text-[13px] font-semibold">
                    {phaseLabel} {job.done}/{job.total}
                  </p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.14]">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              )}
            </div>
            {job.finished && !job.error ? (
              <Link
                href="/library?status=watched"
                onClick={dismiss}
                className="flex h-8 shrink-0 items-center rounded-full bg-accent px-3 text-xs font-bold text-white"
              >
                Libreria
              </Link>
            ) : null}
            {job.finished && (
              <button
                type="button"
                onClick={dismiss}
                aria-label="Chiudi"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/[0.12]"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

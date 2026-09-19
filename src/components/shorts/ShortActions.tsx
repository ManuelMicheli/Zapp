"use client";

import { useMirroredValue } from "@/lib/ui/optimistic";
import { togglePreferito, toggleVisto } from "@/lib/shorts/actions";
import { youtubeUrl, type ShortFilm } from "@/lib/shorts/shape";

/**
 * I due interruttori del corto piu' il link a YouTube.
 *
 * `useMirroredValue` e non `useOptimisticValue`: le azioni rivalidano anche `/corti`
 * e `/profile`, e con `useOptimistic` il valore tornerebbe indietro appena chiusa la
 * transizione — si vedrebbe il salto (vedi `src/lib/ui/optimistic.ts`).
 */
export function ShortActions({
  corto,
  visto,
  preferito,
  autenticato,
}: {
  corto: ShortFilm;
  visto: boolean;
  preferito: boolean;
  autenticato: boolean;
}) {
  const statoVisto = useMirroredValue(visto);
  const statoPreferito = useMirroredValue(preferito);

  const BASE =
    "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50 lg:h-12 lg:text-[15px]";

  return (
    <div className="flex flex-wrap gap-2.5">
      <button
        type="button"
        disabled={!autenticato || statoVisto.pending}
        aria-pressed={statoVisto.value}
        onClick={() =>
          statoVisto.run(!statoVisto.value, () => toggleVisto(corto.youtubeId), {
            message: statoVisto.value ? "Tolto dai visti" : "Segnato come visto",
          })
        }
        className={`${BASE} ${statoVisto.value ? "glass-accent text-white" : "glass text-text hover:bg-white/15"}`}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m5 13 4 4L19 7" />
        </svg>
        {statoVisto.value ? "Visto" : "Segna visto"}
      </button>

      <button
        type="button"
        disabled={!autenticato || statoPreferito.pending}
        aria-pressed={statoPreferito.value}
        onClick={() =>
          statoPreferito.run(
            !statoPreferito.value,
            () => togglePreferito(corto.youtubeId),
            {
              message: statoPreferito.value
                ? "Tolto dai preferiti"
                : "Aggiunto ai preferiti",
            },
          )
        }
        className={`${BASE} ${statoPreferito.value ? "glass-accent text-white" : "glass text-text hover:bg-white/15"}`}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill={statoPreferito.value ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 21s-7.5-4.6-9.4-9A5.3 5.3 0 0 1 12 6.6 5.3 5.3 0 0 1 21.4 12c-1.9 4.4-9.4 9-9.4 9Z" />
        </svg>
        {statoPreferito.value ? "Nei preferiti" : "Preferito"}
      </button>

      <a
        href={youtubeUrl(corto)}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BASE} glass text-text hover:bg-white/15`}
      >
        Apri su YouTube
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </a>
    </div>
  );
}

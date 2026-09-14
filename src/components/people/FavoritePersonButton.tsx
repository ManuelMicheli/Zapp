"use client";

import { useRouter } from "next/navigation";
import { useMirroredValue } from "@/lib/ui/optimistic";
import { togglePreferito } from "@/lib/people/actions";

/**
 * Cuore "persona preferita": toggle ottimistico, al massimo 12 (il rifiuto arriva dal
 * server come toast). Lo usano la testata della pagina persona e le righe del cast.
 */
export function FavoritePersonButton({
  personId,
  name,
  role,
  profilePath,
  favorite,
  size = 40,
}: {
  personId: number;
  name: string;
  role: "Cast" | "Regia";
  profilePath: string | null;
  favorite: boolean;
  /** 40 in testata, 32 nella riga del cast. */
  size?: 32 | 40;
}) {
  const router = useRouter();
  const { value: on, pending, run } = useMirroredValue(favorite);

  function toggle(e: React.MouseEvent) {
    // la riga del cast e' un link: il cuore non deve navigare
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    // `togglePreferito` risponde `{ ok, error? }`: quando il tetto e' pieno,
    // `useMirroredValue` mostra da solo `error` come toast e torna indietro.
    run(!on, () => togglePreferito({ personId, name, role, profilePath }), {
      onDone: () => router.refresh(),
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `Togli ${name} dai preferiti` : `Aggiungi ${name} ai preferiti`}
      style={{ width: size, height: size }}
      className={`glass flex shrink-0 items-center justify-center rounded-full transition-colors ${
        on ? "text-accent-light" : "text-text"
      } ${pending ? "opacity-70" : ""}`}
    >
      <svg
        width={size === 40 ? 19 : 16}
        height={size === 40 ? 19 : 16}
        viewBox="0 0 24 24"
        fill={on ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
      </svg>
    </button>
  );
}

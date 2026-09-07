"use client";

import { useState } from "react";
import Image from "next/image";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import type { TmdbCastMember } from "@/lib/tmdb/types";

const SHOWN = 5;

/**
 * Cast in elenco verticale (scelta utente 2026-09-07, mockup "Cast C"): sta nella
 * colonna stretta della scheda, dove i cerchi in fila orizzontale sprecavano spazio.
 * "Vedi tutto il cast" apre il resto sul posto: non esiste una pagina del cast.
 */
export function CastRow({ cast }: { cast: TmdbCastMember[] }) {
  const [expanded, setExpanded] = useState(false);
  const main = cast.slice(0, 20);
  if (main.length === 0) return null;

  const shown = expanded ? main : main.slice(0, SHOWN);
  const rest = main.length - shown.length;

  return (
    <section className="flex flex-col gap-3.5 px-5 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">Cast</h2>

      <ul className="flex flex-col gap-3.5">
        {shown.map((member) => (
          <li key={member.id} className="flex items-center gap-3">
            <div className="relative size-[46px] shrink-0 overflow-hidden rounded-full border border-white/[0.08] bg-surface-2">
              {member.profile_path ? (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w185${member.profile_path}`}
                  alt={member.name}
                  fill
                  sizes="46px"
                  className="object-cover object-[50%_20%]"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-sm text-muted">
                  {member.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-semibold">{member.name}</p>
              {member.character && (
                <p className="truncate text-xs text-muted">
                  {member.character.split("/")[0].trim()}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {rest > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-3 text-left"
        >
          <span className="flex size-[46px] shrink-0 items-center justify-center rounded-full border border-dashed border-white/[0.16] text-xs font-semibold text-muted">
            +{rest}
          </span>
          <span className="text-sm font-semibold text-accent-soft">
            Vedi tutto il cast
          </span>
        </button>
      )}
    </section>
  );
}

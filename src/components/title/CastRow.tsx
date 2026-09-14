"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { clearFavoriteCharacter, setFavoriteCharacter } from "@/lib/characters/actions";
import { applyVote, buildCharacterChart, primaryCharacter } from "@/lib/characters/rank";
import type { CharacterVotes } from "@/lib/characters/queries";
import { useOptimisticValue } from "@/lib/ui/optimistic";
import { CharacterChart } from "./CharacterChart";

const SHOWN = 5;

/**
 * Cast in elenco verticale (scelta utente 2026-09-07, mockup "Cast C"): sta nella
 * colonna stretta della scheda, dove i cerchi in fila orizzontale sprecavano spazio.
 * "Vedi tutto il cast" apre il resto sul posto: non esiste una pagina del cast.
 *
 * Con la sessione ogni riga ha un cuore: un tocco vota il personaggio preferito,
 * un altro lo toglie; sotto, il grafico dei voti di tutti. `votes` nullo = da
 * sloggato, né cuore né grafico. L'anticipo è `useOptimisticValue` perché la base
 * arriva da una prop e l'azione rivalida proprio questa rotta.
 */
export function CastRow({
  cast,
  votes = null,
  titleId,
  mediaType,
}: {
  cast: TmdbCastMember[];
  votes?: CharacterVotes | null;
  titleId?: number;
  mediaType?: "movie" | "tv";
}) {
  const [expanded, setExpanded] = useState(false);
  const main = cast.slice(0, 20);
  const canVote = votes !== null && titleId !== undefined && mediaType !== undefined;

  const { value, run } = useOptimisticValue<CharacterVotes>(
    votes ?? { counts: [], myPersonId: null },
  );
  const chart = useMemo(
    () => buildCharacterChart(value.counts, cast.slice(0, 20), value.myPersonId),
    [value, cast],
  );

  if (main.length === 0) return null;

  const shown = expanded ? main : main.slice(0, SHOWN);
  const rest = main.length - shown.length;

  const toggle = (member: TmdbCastMember) => {
    if (!canVote) return;
    const previous = value.myPersonId;
    const next = previous === member.id ? null : member.id;
    run(
      {
        myPersonId: next,
        counts: applyVote(
          value.counts,
          previous,
          next,
          primaryCharacter(member.character),
        ),
      },
      () =>
        next === null
          ? clearFavoriteCharacter(titleId, mediaType)
          : setFavoriteCharacter(titleId, mediaType, next),
    );
  };

  return (
    <section className="flex flex-col gap-3.5 px-5 md:px-0">
      <h2 className="text-xl font-bold tracking-[-0.03em]">Cast</h2>

      <ul className="flex flex-col gap-3.5">
        {shown.map((member) => {
          const mine = canVote && value.myPersonId === member.id;
          return (
            <li key={member.id} className="flex items-center gap-3">
              <div
                className={`relative size-[46px] shrink-0 overflow-hidden rounded-full border bg-surface-2 ${
                  mine ? "border-accent-soft" : "border-white/[0.08]"
                }`}
              >
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
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-sm font-semibold">{member.name}</p>
                {member.character && (
                  <p className="truncate text-xs text-muted">
                    {primaryCharacter(member.character)}
                  </p>
                )}
              </div>
              {canVote && (
                <button
                  type="button"
                  onClick={() => toggle(member)}
                  aria-pressed={mine}
                  aria-label={
                    mine
                      ? `Togli ${primaryCharacter(member.character) || member.name} dai preferiti`
                      : `Scegli ${primaryCharacter(member.character) || member.name} come personaggio preferito`
                  }
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                    mine
                      ? "text-accent-soft"
                      : "text-muted-2 hover:text-text active:text-accent-soft"
                  }`}
                >
                  <HeartIcon filled={mine} />
                </button>
              )}
            </li>
          );
        })}
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

      {canVote && (
        <div className="mt-2 flex flex-col gap-3">
          <h3 className="text-base font-bold tracking-[-0.02em]">
            Personaggio preferito
          </h3>
          <CharacterChart chart={chart} />
        </div>
      )}
    </section>
  );
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M12 20.5s-7.5-4.6-7.5-10A4.2 4.2 0 0 1 12 8.2a4.2 4.2 0 0 1 7.5 2.3c0 5.4-7.5 10-7.5 10Z" />
    </svg>
  );
}

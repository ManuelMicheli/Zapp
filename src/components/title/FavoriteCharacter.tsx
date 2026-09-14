"use client";

import { useMemo } from "react";
import Image from "next/image";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { clearFavoriteCharacter, setFavoriteCharacter } from "@/lib/characters/actions";
import { applyVote, buildCharacterChart, primaryCharacter } from "@/lib/characters/rank";
import type { CharacterVotes } from "@/lib/characters/queries";
import { useOptimisticValue } from "@/lib/ui/optimistic";
import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import { CharacterChart } from "./CharacterChart";

/** Quanti personaggi si possono scegliere: i primi del cast, come l'elenco Cast. */
const MAX_CHARACTERS = 20;

/**
 * Sezione "Personaggio preferito", a sé rispetto al cast (scelta utente
 * 2026-09-14: il cuore sulle righe del cast resta per l'attore preferito). Una
 * fila scorrevole di volti col nome del **personaggio** sotto: un tocco vota,
 * un altro sullo stesso toglie; sotto, il grafico dei voti di tutti.
 *
 * TMDB non ha immagini dei personaggi: il volto è la foto dell'interprete.
 * L'anticipo è `useOptimisticValue` perché la base arriva da una prop e
 * l'azione rivalida proprio questa rotta.
 */
export function FavoriteCharacter({
  cast,
  votes,
  titleId,
  mediaType,
}: {
  cast: TmdbCastMember[];
  votes: CharacterVotes;
  titleId: number;
  mediaType: "movie" | "tv";
}) {
  const characters = useMemo(
    () =>
      cast
        .slice(0, MAX_CHARACTERS)
        .map((member) => ({ member, character: primaryCharacter(member.character) }))
        .filter((c) => c.character.length > 0),
    [cast],
  );
  const { value, run } = useOptimisticValue<CharacterVotes>(votes);
  const chart = useMemo(
    () => buildCharacterChart(value.counts, cast, value.myPersonId),
    [value, cast],
  );

  if (characters.length === 0) return null;

  const toggle = (member: TmdbCastMember, character: string) => {
    const previous = value.myPersonId;
    const next = previous === member.id ? null : member.id;
    run(
      {
        myPersonId: next,
        counts: applyVote(value.counts, previous, next, character),
      },
      () =>
        next === null
          ? clearFavoriteCharacter(titleId, mediaType)
          : setFavoriteCharacter(titleId, mediaType, next),
    );
  };

  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5 px-5 md:px-0">
        <h2 className="text-xl font-bold tracking-[-0.03em]">Personaggio preferito</h2>
        <p className="text-sm text-muted">
          {value.myPersonId === null
            ? "Tocca un personaggio per votarlo."
            : "Tocca di nuovo il tuo per togliere il voto, o scegline un altro."}
        </p>
      </div>

      <HorizontalScroll
        label="Personaggi"
        className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:px-0"
      >
        {characters.map(({ member, character }) => {
          const mine = value.myPersonId === member.id;
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => toggle(member, character)}
              aria-pressed={mine}
              aria-label={
                mine
                  ? `Togli il voto a ${character}`
                  : `Vota ${character} come personaggio preferito`
              }
              className="group flex w-[76px] shrink-0 flex-col items-center gap-2 text-center"
            >
              <span
                className={`relative block size-16 overflow-hidden rounded-full border-2 bg-surface-2 transition-[border-color,transform] group-active:scale-95 motion-reduce:transition-none ${
                  mine
                    ? "border-accent-soft shadow-[0_0_0_3px_rgba(167,139,250,0.25)]"
                    : "border-white/[0.08] group-hover:border-white/[0.25]"
                }`}
              >
                {member.profile_path ? (
                  <Image
                    src={`${TMDB_IMAGE_BASE}/w185${member.profile_path}`}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover object-[50%_20%]"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-base text-muted">
                    {character.charAt(0)}
                  </span>
                )}
                {mine && (
                  <span className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full bg-accent text-white">
                    <CheckIcon />
                  </span>
                )}
              </span>
              <span
                className={`line-clamp-2 text-xs leading-tight ${
                  mine ? "font-semibold text-text" : "font-medium text-muted"
                }`}
              >
                {character}
              </span>
            </button>
          );
        })}
      </HorizontalScroll>

      <div className="px-5 md:px-0">
        <CharacterChart chart={chart} />
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

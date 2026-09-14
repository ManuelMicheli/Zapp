"use client";

import { useMemo } from "react";
import Image from "next/image";
import type { TmdbCastMember } from "@/lib/tmdb/types";
import { clearFavoriteCharacter, setFavoriteCharacter } from "@/lib/characters/actions";
import { applyVote, buildCharacterChart, primaryCharacter } from "@/lib/characters/rank";
import type { CharacterPortrait } from "@/lib/characters/match";
import type { CharacterVotes } from "@/lib/characters/queries";
import { useOptimisticValue } from "@/lib/ui/optimistic";
import { CharacterChart } from "./CharacterChart";

/** Quante card al massimo (con ritratto) e quante almeno (riserve comprese). */
const MAX_CHARACTERS = 12;
const MIN_CHARACTERS = 8;

/**
 * Sezione "Personaggio preferito" della scheda serie (scelte utente 2026-09-14:
 * sezione a sé, immagini dei **personaggi** e non degli interpreti, nella colonna
 * larga sopra "Simili"). Card verticali 2:3 come le locandine, col ritratto di
 * TVmaze a tutta card, il nome del personaggio in basso e l'interprete sotto in
 * piccolo. Un tocco vota, un altro sullo stesso toglie; la card votata ha il
 * bordo viola e la spunta. Sotto le card, il grafico dei voti di tutti.
 *
 * L'anticipo è `useOptimisticValue` perché la base arriva da una prop e
 * l'azione rivalida proprio questa rotta.
 */
export function FavoriteCharacter({
  cast,
  portraits,
  votes,
  titleId,
}: {
  cast: TmdbCastMember[];
  /** Ritratti per id persona: si mostrano solo i personaggi che ne hanno uno. */
  portraits: Record<number, CharacterPortrait>;
  votes: CharacterVotes;
  titleId: number;
}) {
  // tutti i personaggi principali sono votabili, con o senza ritratto: chi non
  // ce l'ha prende una card di riserva con l'iniziale. Prima chi ha il ritratto
  // (nell'ordine del cast), poi gli altri: in una serie lunga le comparse fisse
  // (il barista di Shameless) contano più episodi di un coprotagonista, e senza
  // questo ordine prendevano il posto di chi ha un volto.
  const characters = useMemo(() => {
    const all = cast
      .map((member) => ({
        member,
        portrait: portraits[member.id] ?? null,
        character: primaryCharacter(member.character),
      }))
      .filter((c) => c.character.length > 0);
    const withPortrait = all.filter((c) => c.portrait).slice(0, MAX_CHARACTERS);
    // le card di riserva completano fino a MIN_CHARACTERS, non oltre: una fila di
    // iniziali per i ricorrenti di una sitcom (Friends: Gunther, Janice) non aggiunge
    // niente, mentre in una serie con pochi ritratti tengono votabili i principali
    const spare = Math.max(0, MIN_CHARACTERS - withPortrait.length);
    return [...withPortrait, ...all.filter((c) => !c.portrait).slice(0, spare)];
  }, [cast, portraits]);
  const { value, run } = useOptimisticValue<CharacterVotes>(votes);
  const chart = useMemo(
    () => buildCharacterChart(value.counts, cast, value.myPersonId),
    [value, cast],
  );
  const shareOf = useMemo(() => {
    const total = value.counts.reduce((sum, row) => sum + row.votes, 0);
    const map = new Map<number, number>();
    if (total > 0) {
      for (const row of value.counts)
        map.set(row.personId, Math.round((row.votes / total) * 100));
    }
    return map;
  }, [value]);

  if (characters.length === 0) return null;

  const toggle = (member: TmdbCastMember, character: string) => {
    const previous = value.myPersonId;
    const next = previous === member.id ? null : member.id;
    run(
      { myPersonId: next, counts: applyVote(value.counts, previous, next, character) },
      () =>
        next === null
          ? clearFavoriteCharacter(titleId, "tv")
          : setFavoriteCharacter(titleId, "tv", next),
    );
  };

  return (
    <section className="flex flex-col gap-5 px-5 md:px-0">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Personaggio preferito</h2>
          <p className="text-sm text-muted">
            {value.myPersonId === null
              ? "Chi ti è rimasto dentro? Tocca una card per votare."
              : "Il tuo voto è segnato. Tocca un'altra card per cambiarlo, la stessa per toglierlo."}
          </p>
        </div>
        {chart.total > 0 && (
          <p className="glass shrink-0 rounded-full px-3 py-1 text-xs font-semibold tabular-nums">
            {chart.total === 1 ? "1 voto" : `${chart.total} voti`}
          </p>
        )}
      </div>

      <ul className="scrollbar-none -mx-5 flex gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-6">
        {characters.map(({ member, portrait, character }) => {
          const mine = value.myPersonId === member.id;
          const share = shareOf.get(member.id) ?? 0;
          return (
            <li key={member.id} className="w-[148px] shrink-0 md:w-auto">
              <button
                type="button"
                onClick={() => toggle(member, character)}
                aria-pressed={mine}
                aria-label={
                  mine
                    ? `Togli il voto a ${character}`
                    : `Vota ${character} come personaggio preferito`
                }
                className={`group relative block aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-surface-2 text-left transition-[transform,box-shadow] duration-300 ease-out active:scale-[0.97] motion-reduce:transition-none ${
                  mine
                    ? "shadow-[0_0_0_2px_var(--color-accent-soft),0_18px_40px_-16px_rgba(139,92,246,0.7)]"
                    : "hover:shadow-[0_0_0_1px_rgba(255,255,255,0.18)]"
                }`}
              >
                {portrait ? (
                  <Image
                    src={portrait.image}
                    alt=""
                    fill
                    unoptimized
                    sizes="(min-width: 1024px) 16vw, (min-width: 768px) 22vw, 148px"
                    className={`object-cover object-[50%_18%] transition-[transform,filter] duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none ${
                      value.myPersonId !== null && !mine ? "saturate-[0.75]" : ""
                    }`}
                  />
                ) : (
                  // riserva: nessuna fonte ha il ritratto, ma il personaggio resta votabile
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(120%_90%_at_50%_0%,rgba(139,92,246,0.35),rgba(20,20,26,1)_70%)] text-5xl font-bold tracking-[-0.04em] text-white/25"
                  >
                    {character.charAt(0)}
                  </span>
                )}
                {/* velo dal basso: il nome resta leggibile su qualunque ritratto */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

                {share > 0 && (
                  <span className="glass absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums">
                    {share}%
                  </span>
                )}
                {mine && (
                  <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-accent text-white shadow-md">
                    <CheckIcon />
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-3">
                  <p className="line-clamp-2 text-[15px] font-bold leading-tight tracking-[-0.02em] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]">
                    {character}
                  </p>
                  <p className="truncate text-[11px] font-medium text-white/65">
                    {member.name}
                  </p>
                </div>

                {share > 0 && (
                  <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10">
                    <div
                      className={`h-full transition-[width] duration-500 motion-reduce:transition-none ${
                        mine ? "bg-accent-light" : "bg-accent"
                      }`}
                      style={{ width: `${share}%` }}
                    />
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <CharacterChart chart={chart} portraits={portraits} />
    </section>
  );
}

function CheckIcon() {
  return (
    <svg
      width={14}
      height={14}
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

"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { backdropUrl, posterUrl } from "@/lib/config";
import { formatShowingDate, formatTime, minutesUntil } from "@/lib/cinema/dates";
import { formatDistance } from "@/lib/cinema/geo";
import type { FilmEntry } from "@/lib/cinema/programme";
import { shortVenueName } from "@/lib/cinema/rank";
import type { Cinema, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { ShowtimeChip } from "./ShowtimeChip";
import { TicketSheet } from "./TicketSheet";

export type { FilmEntry } from "@/lib/cinema/programme";

/** Sale in più mostrate sotto la principale (oltre, "Altre N sale" porta alla scheda). */
const EXTRA_VENUES = 2;
/** Orari per sala in più. */
const EXTRA_TIMES = 3;

/**
 * "Per film" ("Cinema A · Copertine"): ogni film è una card col suo fondale 16:9 e il
 * titolo sopra; sotto, la sala preferita — altrimenti la più importante — che lo dà
 * coi prossimi orari a pillola e, in righe compatte, fino a `EXTRA_VENUES` altre sale
 * con i loro orari (un tocco apre il foglio biglietti di quello spettacolo). Tre
 * colonne da `lg`.
 */
export function FilmsView({
  entries,
  friends,
  nowMs,
}: {
  entries: FilmEntry[];
  friends: MiniProfile[];
  nowMs: number;
}) {
  const [pick, setPick] = useState<{
    entry: FilmEntry;
    cinema: Cinema;
    showing: Showing;
  } | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  function open(entry: FilmEntry, cinema: Cinema, showing: Showing) {
    setPick({ entry, cinema, showing });
    setTicketOpen(true);
  }

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-3 lg:gap-6">
        {entries.map((entry) => {
          const bg =
            backdropUrl(entry.film.backdropPath, "original") ??
            posterUrl(entry.film.posterPath, "w500");
          const future = entry.showings.filter((s) => minutesUntil(s.start, nowMs) >= 0);
          const next = future.slice(0, 3);
          const href =
            entry.film.tmdbId != null ? `/title/movie/${entry.film.tmdbId}` : null;
          const sale = entry.cinemaCount === 1 ? "1 sala" : `${entry.cinemaCount} sale`;
          // le altre sale, con almeno uno spettacolo ancora da venire
          const extras = entry.venues
            .filter((v) => v.cinema.id !== entry.cinema.id)
            .map((v) => ({
              cinema: v.cinema,
              times: v.showings
                .filter((s) => minutesUntil(s.start, nowMs) >= 0)
                .slice(0, EXTRA_TIMES),
            }))
            .filter((v) => v.times.length > 0)
            .slice(0, EXTRA_VENUES);
          const hidden = entry.cinemaCount - 1 - extras.length;
          const cover = (
            <div className="relative aspect-video">
              {bg && (
                <Image
                  src={bg}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 33vw, 100vw"
                  quality={95}
                  className="object-cover object-[50%_30%]"
                />
              )}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_40%,rgba(14,14,18,0.85)_100%)]" />
              <span className="glass absolute right-3 top-3 inline-flex h-[26px] items-center rounded-full px-2.5 text-[11px] font-semibold">
                {sale}
              </span>
              <h3 className="absolute inset-x-4 bottom-3 line-clamp-2 text-[22px] font-extrabold leading-[1.05] tracking-[-0.04em] lg:text-[24px]">
                {entry.film.title}
              </h3>
            </div>
          );
          return (
            <article
              key={entry.film.sourceFilmId}
              className="overflow-hidden rounded-[20px] border border-border bg-surface"
            >
              {href ? <Link href={href}>{cover}</Link> : cover}
              <div className="flex flex-col gap-2.5 px-4 pb-3.5 pt-3">
                <p className="flex items-center gap-1.5 text-[13px] text-muted">
                  {entry.cinema.favorite && (
                    <span className="shrink-0 text-accent-pale" aria-label="Preferito">
                      ★
                    </span>
                  )}
                  <span className="truncate text-text">{entry.cinema.name}</span>
                  <span className="shrink-0">
                    · {formatDistance(entry.cinema.distanceKm)}
                  </span>
                </p>
                <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
                  {next.length === 0 ? (
                    <span className="py-2 text-[13px] text-muted-2">
                      Nessun altro spettacolo oggi
                    </span>
                  ) : (
                    next.map((s, i) => (
                      <ShowtimeChip
                        key={`${s.start}-${s.format}`}
                        showing={s}
                        state={i === 0 ? "next" : "future"}
                        onClick={() => open(entry, entry.cinema, s)}
                      />
                    ))
                  )}
                </div>
                {(extras.length > 0 || hidden > 0) && (
                  <ul className="flex flex-col divide-y divide-white/[0.06] border-t border-white/[0.08] pt-1">
                    {extras.map(({ cinema, times }) => (
                      <li
                        key={cinema.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <p className="min-w-0 truncate text-[13px] text-muted">
                          <span className="text-text">{shortVenueName(cinema.name)}</span>{" "}
                          · {formatDistance(cinema.distanceKm)}
                        </p>
                        <div className="flex shrink-0 gap-1.5">
                          {times.map((s) => (
                            <button
                              key={`${s.start}-${s.format}`}
                              type="button"
                              onClick={() => open(entry, cinema, s)}
                              className="glass inline-flex h-7 items-center rounded-full px-2.5 text-[12px] font-semibold tabular-nums"
                            >
                              {formatTime(s.start)}
                            </button>
                          ))}
                        </div>
                      </li>
                    ))}
                    {hidden > 0 && entry.film.tmdbId != null && (
                      <li className="py-2">
                        <Link
                          href={`/cinema?film=${entry.film.tmdbId}`}
                          className="text-[13px] font-medium text-accent-soft"
                        >
                          {hidden === 1 ? "Un’altra sala" : `Altre ${hidden} sale`} →
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {pick && (
        <TicketSheet
          open={ticketOpen}
          onClose={() => setTicketOpen(false)}
          film={pick.entry.film}
          cinema={pick.cinema}
          showing={pick.showing}
          onInvite={() => {
            setTicketOpen(false);
            setInviteOpen(true);
          }}
        />
      )}

      {pick?.entry.film.tmdbId != null && (
        <RecommendSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          titleId={pick.entry.film.tmdbId}
          mediaType="movie"
          friends={friends}
          initialMessage={`Vieni al ${pick.cinema.name} ${formatShowingDate(pick.showing.start).toLowerCase()}?`}
        />
      )}
    </>
  );
}

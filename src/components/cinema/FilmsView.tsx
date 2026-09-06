"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { backdropUrl, posterUrl } from "@/lib/config";
import { formatShowingDate, minutesUntil } from "@/lib/cinema/dates";
import { formatDistance } from "@/lib/cinema/geo";
import type { FilmEntry } from "@/lib/cinema/programme";
import type { Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { ShowtimeChip } from "./ShowtimeChip";
import { TicketSheet } from "./TicketSheet";

export type { FilmEntry } from "@/lib/cinema/programme";

/**
 * "Per film" ("Cinema A · Copertine"): ogni film è una card col suo fondale 16:9 e il
 * titolo sopra; sotto, la sala preferita o più vicina che lo dà e i prossimi orari.
 * Tre colonne da `lg`.
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
  const [pick, setPick] = useState<{ entry: FilmEntry; showing: Showing } | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

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
                <p className="truncate text-[13px] text-muted">
                  {entry.cinema.name} · {formatDistance(entry.cinema.distanceKm)}
                  {entry.cinemaCount > 1 && ` · +${entry.cinemaCount - 1} sale`}
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
                        onClick={() => {
                          setPick({ entry, showing: s });
                          setTicketOpen(true);
                        }}
                      />
                    ))
                  )}
                </div>
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
          cinema={pick.entry.cinema}
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
          initialMessage={`Vieni al ${pick.entry.cinema.name} ${formatShowingDate(pick.showing.start).toLowerCase()}?`}
        />
      )}
    </>
  );
}

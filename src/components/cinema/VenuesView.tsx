"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { posterUrl } from "@/lib/config";
import { formatCountdown, formatShowingDate, minutesUntil } from "@/lib/cinema/dates";
import { directionsUrl } from "@/lib/cinema/geo";
import type { Cinema, ProgrammeFilm, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { CinemaHeader } from "./CinemaHeader";
import { Icon } from "./icons";
import { ShowtimeChip } from "./ShowtimeChip";
import { TicketSheet } from "./TicketSheet";

export interface VenueEntry {
  cinema: Cinema;
  films: ProgrammeFilm[];
}

export function VenuesView({
  entries,
  friends,
  nowMs,
}: {
  entries: VenueEntry[];
  friends: MiniProfile[];
  nowMs: number;
}) {
  const [pick, setPick] = useState<{
    cinema: Cinema;
    film: ProgrammeFilm["film"];
    showing: Showing;
  } | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(/iPhone|iPad|iPod/.test(navigator.userAgent)), []);

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map(({ cinema, films }, i) => (
          <article
            key={cinema.id}
            className="rounded-[20px] border border-border bg-surface p-4"
          >
            <CinemaHeader
              cinema={cinema}
              nearest={i === 0}
              action={
                <a
                  href={directionsUrl(cinema, ios)}
                  target="_blank"
                  rel="noopener"
                  aria-label="Indicazioni"
                  className="glass flex size-10 shrink-0 items-center justify-center rounded-full"
                >
                  <Icon name="nav" size={18} />
                </a>
              }
            />

            <div className="mt-3 flex flex-col gap-3">
              {films.map(({ film, showings }) => {
                const poster = posterUrl(film.posterPath, "w92");
                const href = film.tmdbId != null ? `/title/movie/${film.tmdbId}` : null;
                const future = showings.filter((s) => minutesUntil(s.start, nowMs) >= 0);
                const nextStart = future[0]?.start ?? null;
                return (
                  <div key={film.sourceFilmId} className="flex gap-3">
                    <div className="relative aspect-[2/3] w-11 shrink-0 overflow-hidden rounded-md bg-surface-2">
                      {poster && (
                        <Image
                          src={poster}
                          alt=""
                          fill
                          sizes="44px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">
                        {href ? <Link href={href}>{film.title}</Link> : film.title}
                      </p>
                      <div className="scrollbar-none mt-1.5 flex gap-2 overflow-x-auto">
                        {showings.map((s) => (
                          <ShowtimeChip
                            key={`${s.start}-${s.format}`}
                            showing={s}
                            state={
                              minutesUntil(s.start, nowMs) < 0
                                ? "past"
                                : s.start === nextStart
                                  ? "next"
                                  : "future"
                            }
                            countdown={
                              s.start === nextStart
                                ? formatCountdown(minutesUntil(s.start, nowMs))
                                : undefined
                            }
                            onClick={() => {
                              setPick({ cinema, film, showing: s });
                              setTicketOpen(true);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {pick && (
        <TicketSheet
          open={ticketOpen}
          onClose={() => setTicketOpen(false)}
          film={pick.film}
          cinema={pick.cinema}
          showing={pick.showing}
          onInvite={() => {
            setTicketOpen(false);
            setInviteOpen(true);
          }}
        />
      )}

      {pick?.film.tmdbId != null && (
        <RecommendSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          titleId={pick.film.tmdbId}
          mediaType="movie"
          friends={friends}
          initialMessage={`Vieni al ${pick.cinema.name} ${formatShowingDate(pick.showing.start).toLowerCase()}?`}
        />
      )}
    </>
  );
}

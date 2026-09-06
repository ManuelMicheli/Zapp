"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { posterUrl } from "@/lib/config";
import { formatShowingDate, formatTime, minutesUntil } from "@/lib/cinema/dates";
import { nearestCinemaId } from "@/lib/cinema/favorites";
import { directionsUrl, formatDistance, walkingMinutes } from "@/lib/cinema/geo";
import type { VenueEntry } from "@/lib/cinema/programme";
import type { Cinema, ProgrammeFilm, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { FavoriteStar } from "./FavoriteStar";
import { Icon } from "./icons";
import { TicketSheet } from "./TicketSheet";

export type { VenueEntry } from "@/lib/cinema/programme";

/**
 * "Per cinema" ("Cinema A · Copertine"): una card per sala con nome, indirizzo,
 * distanza, stella e Indicazioni; sotto, le locandine dei suoi film con il prossimo
 * orario in vetro (viola = il più imminente). Il tocco sulla locandina apre il foglio
 * biglietti di quello spettacolo; il titolo porta alla scheda.
 */
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
  const nearestId = nearestCinemaId(entries.map((e) => e.cinema));

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-6">
        {entries.map(({ cinema, films }) => {
          // per ogni film il prossimo spettacolo; il più imminente della sala è in viola
          const rows = films.map(({ film, showings }) => ({
            film,
            next: showings.find((s) => minutesUntil(s.start, nowMs) >= 0) ?? null,
            last: showings[showings.length - 1] ?? null,
          }));
          const soonest = rows
            .filter((r) => r.next)
            .sort((a, b) => a.next!.start.localeCompare(b.next!.start))[0]
            ?.film.sourceFilmId;
          return (
            <article
              key={cinema.id}
              className="rounded-[20px] border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-[20px] font-extrabold tracking-[-0.035em]">
                    {cinema.name}
                    {cinema.id === nearestId && (
                      <span className="ml-2 inline-block rounded-full bg-white/10 px-2 py-0.5 align-middle text-[11px] font-bold text-text">
                        Il più vicino
                      </span>
                    )}
                  </h3>
                  <p className="mt-0.5 truncate text-[13px] text-muted">
                    {cinema.address}
                    {cinema.city ? `, ${cinema.city}` : ""} ·{" "}
                    {formatDistance(cinema.distanceKm)} ·{" "}
                    {walkingMinutes(cinema.distanceKm)} min a piedi
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <FavoriteStar
                    cinemaId={cinema.id}
                    cinemaName={cinema.name}
                    favorite={cinema.favorite === true}
                  />
                  <a
                    href={directionsUrl(cinema, ios)}
                    target="_blank"
                    rel="noopener"
                    aria-label="Indicazioni"
                    className="glass flex size-10 shrink-0 items-center justify-center rounded-full"
                  >
                    <Icon name="nav" size={18} />
                  </a>
                </div>
              </div>

              <div className="scrollbar-none -mx-4 mt-3.5 flex gap-3 overflow-x-auto px-4">
                {rows.map(({ film, next, last }) => {
                  const poster = posterUrl(film.posterPath, "w185");
                  const href = film.tmdbId != null ? `/title/movie/${film.tmdbId}` : null;
                  const showing = next ?? last;
                  const badge =
                    next == null
                      ? "bg-surface-2 text-muted-2 line-through"
                      : film.sourceFilmId === soonest
                        ? "bg-accent text-white shadow-[var(--shadow-accent)]"
                        : "glass";
                  return (
                    <div
                      key={film.sourceFilmId}
                      className="flex w-24 shrink-0 flex-col gap-2"
                    >
                      <button
                        type="button"
                        disabled={!showing}
                        onClick={() => {
                          if (!showing) return;
                          setPick({ cinema, film, showing });
                          setTicketOpen(true);
                        }}
                        aria-label={
                          showing
                            ? `${film.title}, ${formatTime(showing.start)}`
                            : film.title
                        }
                        className="relative aspect-[2/3] w-24 overflow-hidden rounded-[12px] bg-surface-2 text-left"
                      >
                        {poster && (
                          <Image
                            src={poster}
                            alt=""
                            fill
                            sizes="96px"
                            className="object-cover"
                          />
                        )}
                        {showing && (
                          <span
                            className={`absolute bottom-1.5 left-1.5 inline-flex h-6 items-center rounded-full px-2 text-[11px] font-bold tabular-nums ${badge}`}
                          >
                            {formatTime(showing.start)}
                          </span>
                        )}
                      </button>
                      <p className="truncate text-[12px] font-medium">
                        {href ? <Link href={href}>{film.title}</Link> : film.title}
                      </p>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
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

"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { posterUrl } from "@/lib/config";
import { formatShowingDate, minutesUntil } from "@/lib/cinema/dates";
import { formatDistance } from "@/lib/cinema/geo";
import type { Cinema, FilmSummary, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { ShowtimeChip } from "./ShowtimeChip";
import { TicketSheet } from "./TicketSheet";

export interface FilmEntry {
  film: FilmSummary;
  /** Cinema più vicino che lo dà, con i suoi orari. */
  cinema: Cinema;
  showings: Showing[];
  /** Quanti cinema vicini lo danno. */
  cinemaCount: number;
}

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
      <div className="grid gap-3 lg:grid-cols-2">
        {entries.map((entry) => {
          const poster = posterUrl(entry.film.posterPath, "w185");
          const future = entry.showings.filter((s) => minutesUntil(s.start, nowMs) >= 0);
          const next = future.slice(0, 3);
          const href =
            entry.film.tmdbId != null ? `/title/movie/${entry.film.tmdbId}` : null;
          return (
            <article
              key={entry.film.sourceFilmId}
              className="flex gap-3 rounded-[20px] border border-border bg-surface p-3"
            >
              {href ? (
                <Link href={href} className="shrink-0">
                  <Poster src={poster} alt={entry.film.title} />
                </Link>
              ) : (
                <Poster src={poster} alt={entry.film.title} />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[17px] font-bold tracking-[-0.02em]">
                  {href ? <Link href={href}>{entry.film.title}</Link> : entry.film.title}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {entry.cinema.name} · {formatDistance(entry.cinema.distanceKm)}
                  {entry.cinemaCount > 1 && ` · +${entry.cinemaCount - 1} cinema`}
                </p>
                <div className="scrollbar-none mt-2 flex gap-2 overflow-x-auto">
                  {next.length === 0 ? (
                    <span className="text-[13px] text-muted-2">
                      Nessun altro spettacolo
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

function Poster({ src, alt }: { src: string | null; alt: string }) {
  return (
    <div className="relative aspect-[2/3] w-[72px] overflow-hidden rounded-[10px] bg-surface-2">
      {src && <Image src={src} alt={alt} fill sizes="72px" className="object-cover" />}
    </div>
  );
}

"use client";

import { useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { formatShowingDate } from "@/lib/cinema/dates";
import type { Cinema, CinemaShowtimes, FilmSummary, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { CinemaCard } from "./CinemaCard";
import { TicketSheet } from "./TicketSheet";

interface Pick {
  cinema: Cinema;
  showing: Showing;
}

/** Card dei cinema per un film + foglio biglietti + invito agli amici. */
export function ShowtimesClient({
  film,
  items,
  friends,
  nowMs,
  limit,
}: {
  film: FilmSummary;
  items: CinemaShowtimes[];
  friends: MiniProfile[];
  nowMs: number;
  limit?: number;
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const shown = limit ? items.slice(0, limit) : items;
  const inviteMessage = pick
    ? `Vieni al ${pick.cinema.name} ${formatShowingDate(pick.showing.start).toLowerCase()}?`
    : "";

  return (
    <>
      <div className="flex flex-col gap-3">
        {shown.map((item, i) => (
          <CinemaCard
            key={item.cinema.id}
            cinema={item.cinema}
            showings={item.showings}
            nearest={i === 0}
            nowMs={nowMs}
            onPick={(showing) => {
              setPick({ cinema: item.cinema, showing });
              setTicketOpen(true);
            }}
          />
        ))}
      </div>

      <TicketSheet
        open={ticketOpen}
        onClose={() => setTicketOpen(false)}
        film={film}
        cinema={pick?.cinema ?? null}
        showing={pick?.showing ?? null}
        onInvite={() => {
          setTicketOpen(false);
          setInviteOpen(true);
        }}
      />

      {film.tmdbId != null && (
        <RecommendSheet
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          titleId={film.tmdbId}
          mediaType="movie"
          friends={friends}
          initialMessage={inviteMessage}
        />
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import { formatShowingDate } from "@/lib/cinema/dates";
import { nearestCinemaId } from "@/lib/cinema/favorites";
import { nextShowing } from "@/lib/cinema/programme";
import type { Cinema, CinemaShowtimes, FilmSummary, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { CinemaCard } from "./CinemaCard";
import { FavoriteStar } from "./FavoriteStar";
import { NextShowingCard } from "./NextShowingCard";
import { TicketSheet } from "./TicketSheet";

interface Pick {
  cinema: Cinema;
  showing: Showing;
}

/**
 * Le sale che danno un film + foglio biglietti + invito agli amici. Con `hero` in
 * testa c'è la card "Prossimo spettacolo" e le sale sono righe senza scatola con
 * tutti gli orari visibili (scheda film); altrimenti card (pagina Cinema).
 */
export function ShowtimesClient({
  film,
  items,
  friends,
  nowMs,
  limit,
  hero = false,
}: {
  film: FilmSummary;
  items: CinemaShowtimes[];
  friends: MiniProfile[];
  nowMs: number;
  limit?: number;
  hero?: boolean;
}) {
  const [pick, setPick] = useState<Pick | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const shown = limit ? items.slice(0, limit) : items;
  // Coi preferiti in testa il più vicino non è il primo.
  const nearestId = nearestCinemaId(shown.map((i) => i.cinema));
  const next = hero ? nextShowing(shown, nowMs) : null;
  const inviteMessage = pick
    ? `Vieni al ${pick.cinema.name} ${formatShowingDate(pick.showing.start).toLowerCase()}?`
    : "";

  function open(p: Pick) {
    setPick(p);
    setTicketOpen(true);
  }

  return (
    <>
      <div className={`flex flex-col ${hero ? "gap-2" : "gap-3"}`}>
        {next && <NextShowingCard pick={next} nowMs={nowMs} onPick={open} />}
        <div className={`flex flex-col ${hero ? "pt-2" : "gap-3"}`}>
          {shown.map((item) => (
            <CinemaCard
              key={item.cinema.id}
              cinema={item.cinema}
              showings={item.showings}
              nearest={item.cinema.id === nearestId}
              nowMs={nowMs}
              variant={hero ? "row" : "card"}
              action={
                <FavoriteStar
                  cinemaId={item.cinema.id}
                  cinemaName={item.cinema.name}
                  favorite={item.cinema.favorite === true}
                />
              }
              onPick={(showing) => open({ cinema: item.cinema, showing })}
            />
          ))}
        </div>
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

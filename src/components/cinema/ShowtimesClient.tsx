"use client";

import { useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import type { FilmDay } from "@/lib/cinema/day";
import { formatShowingDate, romeDateString } from "@/lib/cinema/dates";
import { nearestCinemaId } from "@/lib/cinema/favorites";
import { nextShowing } from "@/lib/cinema/programme";
import type { Cinema, FilmSummary, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { CinemaCard } from "./CinemaCard";
import { DayPills } from "./DayPills";
import { FavoriteStar } from "./FavoriteStar";
import { NextShowingCard } from "./NextShowingCard";
import { TicketSheet } from "./TicketSheet";

interface Pick {
  cinema: Cinema;
  showing: Showing;
}

/** Il primo giorno con spettacoli (oggi se ne ha ancora uno futuro), altrimenti oggi. */
export function firstUsefulDay(days: FilmDay[], nowMs: number): string {
  const useful = days.find((d) => nextShowing(d.items, nowMs) !== null);
  return (useful ?? days[0])?.date ?? "";
}

/**
 * Le sale che danno un film nei prossimi giorni + foglio biglietti + invito agli
 * amici. In testa il selettore del giorno (i tre giorni arrivano già dal server) e la
 * card "Prossimo spettacolo"; con `hero` le sale sono righe senza scatola con tutti gli
 * orari visibili (scheda film), altrimenti card (pagina Cinema).
 */
export function ShowtimesClient({
  film,
  days,
  friends,
  nowMs,
  limit,
  hero = false,
}: {
  film: FilmSummary;
  days: FilmDay[];
  friends: MiniProfile[];
  nowMs: number;
  limit?: number;
  hero?: boolean;
}) {
  const [active, setActive] = useState(() => firstUsefulDay(days, nowMs));
  const [pick, setPick] = useState<Pick | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const day = days.find((d) => d.date === active) ?? days[0];
  const items = day?.items ?? [];
  const shown = limit ? items.slice(0, limit) : items;
  // Coi preferiti in testa il più vicino non è il primo.
  const nearestId = nearestCinemaId(shown.map((i) => i.cinema));
  const next = hero ? nextShowing(shown, nowMs) : null;
  const empty = new Set(days.filter((d) => d.items.length === 0).map((d) => d.date));
  const today = romeDateString(new Date(nowMs));
  const inviteMessage = pick
    ? `Vieni al ${pick.cinema.name} ${formatShowingDate(pick.showing.start).toLowerCase()}?`
    : "";

  function open(p: Pick) {
    setPick(p);
    setTicketOpen(true);
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {days.length > 1 && (
          <DayPills days={days} active={active} onSelect={setActive} empty={empty} />
        )}
        {shown.length === 0 ? (
          <p className="rounded-[20px] border border-border bg-surface p-4 text-sm text-muted">
            {day?.date === today
              ? "Nessuno spettacolo vicino a te oggi."
              : "Nessun orario ancora pubblicato per questo giorno vicino a te."}
          </p>
        ) : (
          <>
            {next && (
              <NextShowingCard pick={next} nowMs={nowMs} today={today} onPick={open} />
            )}
            <div className={`flex flex-col ${hero ? "pt-1" : "gap-3"}`}>
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
          </>
        )}
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

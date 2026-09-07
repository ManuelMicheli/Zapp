"use client";

import { useState } from "react";
import { RecommendSheet } from "@/components/title/RecommendSheet";
import type { FilmDay } from "@/lib/cinema/day";
import {
  SHOWING_BANDS,
  formatShowingDate,
  romeDateString,
  showingBand,
  type ShowingBand,
} from "@/lib/cinema/dates";
import { nearestCinemaId } from "@/lib/cinema/favorites";
import { nextShowing } from "@/lib/cinema/programme";
import type { Cinema, FilmSummary, Showing } from "@/lib/cinema/types";
import type { MiniProfile } from "@/lib/social/queries";
import { CinemaCard } from "./CinemaCard";
import { DayPills } from "./DayPills";
import { FavoriteStar } from "./FavoriteStar";
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
 * amici. In testa il selettore del giorno (i tre giorni arrivano già dal server); con
 * `hero` seguono le fasce orarie (pomeriggio / sera / tarda sera) e le sale come righe
 * senza scatola con tutti i loro orari, più il blocco serata in fondo — niente card del
 * primo spettacolo in grande (scelta utente 2026-09-07). Senza `hero` restano le card
 * della pagina Cinema.
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
  const next = hero ? nextShowing(items, nowMs) : null;

  // fasce presenti nel giorno scelto: con una sola le pillole non servono, e si parte
  // dalla fascia del prossimo spettacolo
  const bands = hero
    ? SHOWING_BANDS.filter((b) =>
        items.some((i) => i.showings.some((sh) => showingBand(sh.start) === b.id)),
      )
    : [];
  const [band, setBand] = useState<ShowingBand | undefined>(undefined);
  const activeBand = bands.some((b) => b.id === band)
    ? band
    : next
      ? showingBand(next.showing.start)
      : bands[0]?.id;
  const inBand =
    hero && activeBand
      ? items
          .map((i) => ({
            ...i,
            showings: i.showings.filter((sh) => showingBand(sh.start) === activeBand),
          }))
          .filter((i) => i.showings.length > 0)
      : items;
  const shown = limit ? inBand.slice(0, limit) : inBand;
  // Coi preferiti in testa il più vicino non è il primo.
  const nearestId = nearestCinemaId(shown.map((i) => i.cinema));
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
        {items.length === 0 ? (
          <p className="rounded-[20px] border border-border bg-surface p-4 text-sm text-muted">
            {day?.date === today
              ? "Nessuno spettacolo vicino a te oggi."
              : "Nessun orario ancora pubblicato per questo giorno vicino a te."}
          </p>
        ) : (
          <>
            {bands.length > 1 && (
              <div className="flex gap-1 rounded-[14px] bg-surface-2 p-1">
                {bands.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBand(b.id)}
                    className={`flex-1 rounded-[10px] py-2 text-[13px] font-semibold transition-colors ${
                      b.id === activeBand ? "bg-white/10 text-text" : "text-muted"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
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

            {hero && next && (
              <div className="mt-3 flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[15px] font-semibold">
                    {day?.date === today ? "Ci vai stasera?" : "Ci vai?"}
                  </span>
                  <span className="text-xs text-muted">
                    Salva lo spettacolo e invita chi vuoi
                  </span>
                </div>
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => open(next)}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] bg-accent text-[15px] font-semibold text-white shadow-[var(--shadow-accent)]"
                  >
                    Ci vado
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPick(next);
                      setInviteOpen(true);
                    }}
                    className="glass flex h-12 items-center justify-center rounded-[14px] px-[18px] text-[15px] font-semibold"
                  >
                    Invita amici
                  </button>
                </div>
              </div>
            )}
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

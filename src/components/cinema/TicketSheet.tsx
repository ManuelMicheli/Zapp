"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { formatCountdown, formatTime, minutesUntil } from "@/lib/cinema/dates";
import { formatLabel } from "@/lib/cinema/formats";
import { formatDistance } from "@/lib/cinema/geo";
import { cancelPlan, planShowing, type PlanUndo } from "@/lib/cinema/plans";
import type { Cinema, FilmSummary, Showing } from "@/lib/cinema/types";
import { Icon } from "./icons";
import { TicketImport } from "./TicketImport";
import { TicketShape } from "./TicketShape";

/** "Sab 6 set" (senza orario: quello sta grande nel biglietto). */
function dayLabel(iso: string): string {
  const s = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Foglio "Biglietti" a forma di biglietto (Sheet alto ~90%): backdrop e titolo,
 * orario grande, cinema; nel tagliando la CTA verso la biglietteria ("Scegli i
 * posti" quando il link è lo spettacolo esatto), "Ci vado" e "Invita amici".
 * Dopo "Ci vado" il foglio resta aperto e il tagliando offre "Aggiungi il
 * biglietto" (upload + lettura QR) per quando l'acquisto è fatto.
 */
export function TicketSheet({
  open,
  onClose,
  film,
  cinema,
  showing,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  film: FilmSummary;
  cinema: Cinema | null;
  showing: Showing | null;
  onInvite: () => void;
}) {
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<{ planId: string; undo?: PlanUndo } | null>(null);
  // un altro spettacolo → si riparte da "Ci vado"
  useEffect(() => setSaved(null), [showing?.start, cinema?.id]);

  function goThere() {
    if (!cinema || !showing || film.tmdbId == null) return;
    const tmdbId = film.tmdbId;
    startTransition(async () => {
      const r = await planShowing({
        tmdbId,
        filmTitle: film.title,
        posterPath: film.posterPath,
        backdropPath: film.backdropPath,
        cinemaId: cinema.id,
        cinemaName: cinema.name,
        cinemaAddress: cinema.address,
        cinemaLat: cinema.lat,
        cinemaLng: cinema.lng,
        startsAt: showing.start,
        format: showing.format,
        bookingUrl: showing.bookingUrl,
      });
      if (!r.ok || !r.planId) {
        show(r.error ?? "Errore");
        return;
      }
      const planId = r.planId;
      const undo = r.undo ?? undefined;
      setSaved({ planId, undo });
      show("Serata salvata: la trovi in home", {
        onUndo: () => {
          setSaved(null);
          void cancelPlan(planId, undo);
        },
      });
    });
  }

  const label = showing ? formatLabel(showing.format) : null;
  const minutes = showing ? minutesUntil(showing.start) : 0;
  const direct = showing?.bookingLevel === 2;

  return (
    <Sheet open={open} onClose={onClose} size="tall">
      {cinema && showing && (
        <TicketShape
          backdropPath={film.backdropPath}
          posterPath={film.posterPath}
          title={film.title}
          titleHref={film.tmdbId != null ? `/title/movie/${film.tmdbId}` : null}
          time={formatTime(showing.start)}
          dateLabel={dayLabel(showing.start)}
          formatLabel={label}
          cinemaName={cinema.name}
          cinemaLine={`${cinema.address}${cinema.city ? `, ${cinema.city}` : ""}`}
          rightMeta={
            <>
              <p className="font-semibold">{formatDistance(cinema.distanceKm)}</p>
              <p className="mt-1 text-muted">{formatCountdown(minutes)}</p>
            </>
          }
          notch="bg-sheet"
        >
          {saved ? (
            <div className="flex flex-col gap-3">
              <p className="inline-flex items-center gap-2 text-[15px] font-semibold text-accent-pale">
                <Icon name="check" size={16} /> Serata salvata
              </p>
              <p className="text-[13px] text-muted">
                Hai comprato i biglietti? Aggiungili qui: il QR sarà pronto in home.
              </p>
              <TicketImport planId={saved.planId} />
              <a
                href={showing.bookingUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-white hover:bg-accent-strong"
              >
                <Icon name="ticket" size={16} />
                {direct ? "Scegli i posti" : "Compra i biglietti"}
              </a>
              <Button
                type="button"
                variant="secondary"
                onClick={onInvite}
                className="h-12 px-4 text-[15px]"
              >
                <Icon name="users" size={16} />
                Invita amici
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <a
                href={showing.bookingUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex h-[54px] items-center justify-center gap-2 rounded-full bg-accent px-6 text-[17px] font-semibold text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong"
              >
                <Icon name="ticket" size={18} />
                {direct ? "Scegli i posti" : "Compra i biglietti"}
              </a>
              {direct && (
                <p className="-mt-1 text-center text-[12px] text-muted">
                  Ti porta allo spettacolo scelto sul sito del cinema
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={goThere}
                  disabled={pending || film.tmdbId == null}
                  className="h-12 px-4 text-[15px]"
                >
                  <Icon name="calendar" size={16} />
                  Ci vado
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onInvite}
                  className="h-12 px-4 text-[15px]"
                >
                  <Icon name="users" size={16} />
                  Invita amici
                </Button>
              </div>
            </div>
          )}
        </TicketShape>
      )}
    </Sheet>
  );
}

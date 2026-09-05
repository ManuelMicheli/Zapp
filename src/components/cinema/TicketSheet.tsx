"use client";

import Image from "next/image";
import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toaster";
import { posterUrl } from "@/lib/config";
import { formatShowingDate, formatTime } from "@/lib/cinema/dates";
import { formatLabel } from "@/lib/cinema/formats";
import { formatDistance } from "@/lib/cinema/geo";
import { cancelPlan, planShowing } from "@/lib/cinema/plans";
import type { Cinema, FilmSummary, Showing } from "@/lib/cinema/types";
import { Icon } from "./icons";

/**
 * Foglio "Biglietti": CTA verso la biglietteria del cinema, "Ci vado" (piano +
 * Vuoi vederlo, con undo dal toast) e "Invita amici" (delegato al genitore).
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
  const poster = posterUrl(film.posterPath, "w92");
  const label = showing ? formatLabel(showing.format) : null;

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
      onClose();
      if (!r.ok || !r.planId) {
        show(r.error ?? "Errore");
        return;
      }
      const planId = r.planId;
      const undo = r.undo ?? undefined;
      show("Serata salvata: la trovi in home", {
        onUndo: () => {
          void cancelPlan(planId, undo);
        },
      });
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title="Biglietti">
      {cinema && showing && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {poster && (
              <Image
                src={poster}
                alt=""
                width={48}
                height={72}
                className="rounded-lg bg-surface-2"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-[-0.02em]">
                {film.title}
              </p>
              <p className="text-[22px] font-bold tracking-[-0.03em]">
                {formatShowingDate(showing.start)}
                {label && (
                  <span className="ml-2 rounded-md bg-accent/20 px-1.5 py-0.5 align-middle text-[11px] font-bold text-accent-pale">
                    {label}
                  </span>
                )}
              </p>
              {showing.end && (
                <p className="text-[13px] text-muted">
                  Finisce ~{formatTime(showing.end)}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[14px] bg-surface-2 px-4 py-3 text-sm">
            <p className="font-semibold">{cinema.name}</p>
            <p className="text-muted">
              {cinema.address}
              {cinema.city ? `, ${cinema.city}` : ""} ·{" "}
              {formatDistance(cinema.distanceKm)}
            </p>
          </div>

          <a
            href={showing.bookingUrl}
            target="_blank"
            rel="noopener"
            className="inline-flex h-[54px] items-center justify-center gap-2 rounded-full bg-accent px-6 text-[17px] font-semibold text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong"
          >
            <Icon name="ticket" size={18} />
            Compra i biglietti
          </a>

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
              disabled={film.tmdbId == null}
              className="h-12 px-4 text-[15px]"
            >
              <Icon name="users" size={16} />
              Invita amici
            </Button>
          </div>

          <p className="text-center text-[12px] text-muted-2">
            Posti e prezzi si scelgono sul sito del cinema.
          </p>
        </div>
      )}
    </Sheet>
  );
}

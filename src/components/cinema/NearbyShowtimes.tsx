import type { ReactNode } from "react";
import Link from "next/link";
import { getFilmDays } from "@/lib/cinema/day";
import { recentlyReleased } from "@/lib/cinema/match";
import { isCinemaEnabled } from "@/lib/cinema/source";
import {
  getFavoriteCinemaIds,
  getViewerLocation,
  type ViewerLocation,
} from "@/lib/cinema/queries";
import type { FilmSummary } from "@/lib/cinema/types";
import { getFriendsData } from "@/lib/social/queries";
import type { TitleRow } from "@/lib/tmdb/mappers";
import { LocationChip } from "./LocationChip";
import { LocationPrompt } from "./LocationPrompt";
import { ShowtimesClient } from "./ShowtimesClient";

/** Testata "Al cinema vicino a te" + `LocationChip`, quando c'è una posizione. */
function Section({
  location,
  children,
}: {
  location: ViewerLocation | null;
  children: ReactNode;
}) {
  return (
    <section className="px-5 md:px-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-xl font-bold tracking-[-0.03em]">
          Al cinema vicino a te
        </h2>
        {location && <LocationChip label={location.label} />}
      </div>
      {children}
    </section>
  );
}

/**
 * "Al cinema vicino a te" nella scheda film: selettore Oggi | Domani | dopodomani,
 * card "Prossimo spettacolo" e sotto tutte le sale con tutti gli orari (nessun limite).
 * Oggi da MyMovies (tutte le sale della provincia), i giorni dopo dai JSON delle
 * catene (`getFilmDays`). Assente se la sorgente cinema non è configurata o il film
 * non è in programmazione in nessuno dei tre giorni; senza posizione mostra il prompt
 * solo per le uscite recenti.
 */
export async function NearbyShowtimes({ title }: { title: TitleRow }) {
  if (!isCinemaEnabled()) return null;
  const [location, favIds] = await Promise.all([
    getViewerLocation(),
    getFavoriteCinemaIds(),
  ]);
  // Senza posizione non sappiamo se il film è in sala: prompt solo per le uscite recenti.
  if (!location) {
    return recentlyReleased(title) ? (
      <Section location={null}>
        <LocationPrompt />
      </Section>
    ) : null;
  }
  if (!location.provinceSlug) {
    return (
      <Section location={location}>
        <p className="rounded-[20px] border border-border bg-surface p-4 text-sm text-muted">
          Zona non coperta: MyMovies non ha cinema per la tua provincia.
        </p>
      </Section>
    );
  }
  const [{ sourceId, days }, { friends }] = await Promise.all([
    getFilmDays({ ...location, provinceSlug: location.provinceSlug }, title, favIds),
    getFriendsData(),
  ]);
  if (days.every((d) => d.items.length === 0)) return null;

  const film: FilmSummary = {
    tmdbId: title.id,
    sourceFilmId: sourceId ?? title.id,
    title: title.title,
    posterPath: title.poster_path,
    backdropPath: title.backdrop_path,
  };

  return (
    <Section location={location}>
      <div className="flex flex-col gap-3">
        <ShowtimesClient
          film={film}
          days={days}
          friends={friends}
          nowMs={Date.now()}
          hero
        />
        <Link
          href="/cinema"
          className="self-start pt-1 text-[13px] font-medium text-accent-soft"
        >
          Tutta la programmazione →
        </Link>
      </div>
    </Section>
  );
}

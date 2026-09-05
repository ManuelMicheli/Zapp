import Link from "next/link";
import { nextDays, romeDateString } from "@/lib/cinema/dates";
import { getMovieGluFilmId } from "@/lib/cinema/match";
import { isCinemaEnabled } from "@/lib/cinema/movieglu";
import { getViewerLocation } from "@/lib/cinema/queries";
import { getFilmShowtimes } from "@/lib/cinema/showtimes";
import type { FilmSummary } from "@/lib/cinema/types";
import { getFriendsData } from "@/lib/social/queries";
import type { TitleRow } from "@/lib/tmdb/mappers";
import { DayBar } from "./DayBar";
import { LocationChip } from "./LocationChip";
import { LocationPrompt } from "./LocationPrompt";
import { ShowtimesClient } from "./ShowtimesClient";

/**
 * "Al cinema vicino a te" nella scheda film. Assente se MovieGlu non è
 * configurato o il film non è in programmazione; senza posizione mostra il prompt.
 */
export async function NearbyShowtimes({ title, day }: { title: TitleRow; day?: string }) {
  if (!isCinemaEnabled()) return null;
  const filmId = await getMovieGluFilmId(title).catch(() => null);
  if (filmId == null) return null;

  const days = nextDays(7);
  const selected = days.some((d) => d.date === day) ? day! : days[0].date;
  const location = await getViewerLocation();

  return (
    <section className="px-5 md:px-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="min-w-0 text-xl font-bold tracking-[-0.03em]">
          Al cinema vicino a te
        </h2>
        {location && <LocationChip label={location.label} />}
      </div>

      {!location ? (
        <LocationPrompt />
      ) : (
        <NearbyList
          title={title}
          filmId={filmId}
          days={days}
          selected={selected}
          location={location}
        />
      )}
    </section>
  );
}

async function NearbyList({
  title,
  filmId,
  days,
  selected,
  location,
}: {
  title: TitleRow;
  filmId: number;
  days: ReturnType<typeof nextDays>;
  selected: string;
  location: { lat: number; lng: number };
}) {
  const [items, { friends }] = await Promise.all([
    getFilmShowtimes(location, filmId, title.title, selected).catch(() => []),
    getFriendsData(),
  ]);
  const film: FilmSummary = {
    tmdbId: title.id,
    movieGluFilmId: filmId,
    title: title.title,
    posterPath: title.poster_path,
    backdropPath: title.backdrop_path,
  };

  return (
    <div className="flex flex-col gap-3">
      <DayBar days={days} selected={selected} />
      {items.length === 0 ? (
        <p className="rounded-[20px] border border-border bg-surface p-4 text-sm text-muted">
          {selected === romeDateString()
            ? "Nessuno spettacolo vicino a te oggi. Prova un altro giorno."
            : "Nessuno spettacolo vicino a te in questo giorno."}
        </p>
      ) : (
        <ShowtimesClient
          film={film}
          items={items}
          friends={friends}
          nowMs={Date.now()}
          limit={5}
        />
      )}
      <Link
        href={`/cinema?film=${title.id}&day=${selected}`}
        className="self-start text-[13px] font-medium text-accent-soft"
      >
        Vedi tutti i cinema →
      </Link>
    </div>
  );
}

import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { DayBar } from "@/components/cinema/DayBar";
import { FilmsView, type FilmEntry } from "@/components/cinema/FilmsView";
import { LocationChip } from "@/components/cinema/LocationChip";
import { LocationPrompt } from "@/components/cinema/LocationPrompt";
import { ShowtimesClient } from "@/components/cinema/ShowtimesClient";
import { VenuesView, type VenueEntry } from "@/components/cinema/VenuesView";
import { EmptyState } from "@/components/ui/EmptyState";
import { nextDays } from "@/lib/cinema/dates";
import { getMovieGluFilmId } from "@/lib/cinema/match";
import { isCinemaEnabled } from "@/lib/cinema/movieglu";
import { getViewerLocation } from "@/lib/cinema/queries";
import {
  getCinemaProgramme,
  getFilmShowtimes,
  getNearbyCinemas,
} from "@/lib/cinema/showtimes";
import type { FilmSummary } from "@/lib/cinema/types";
import { getFriendsData } from "@/lib/social/queries";
import { getOrFetchTitle } from "@/lib/tmdb/cache";

export const metadata = { title: "Cinema" };

interface Props {
  searchParams: Promise<{ view?: string; day?: string; film?: string }>;
}

const PILL = "rounded-full px-4 py-1.5 text-xs font-semibold";

/** Aggrega la programmazione dei cinema per film (cinema più vicino in testa). */
function byFilm(venues: VenueEntry[]): FilmEntry[] {
  const map = new Map<number, FilmEntry>();
  for (const { cinema, films } of venues) {
    for (const { film, showings } of films) {
      const cur = map.get(film.movieGluFilmId);
      if (!cur) {
        map.set(film.movieGluFilmId, { film, cinema, showings, cinemaCount: 1 });
      } else {
        cur.cinemaCount += 1;
        if (cinema.distanceKm < cur.cinema.distanceKm) {
          cur.cinema = cinema;
          cur.showings = showings;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.cinemaCount - a.cinemaCount);
}

export default async function CinemaPage({ searchParams }: Props) {
  const { view, day, film } = await searchParams;
  const days = nextDays(7);
  const selected = days.some((d) => d.date === day) ? day! : days[0].date;
  const mode = view === "cinemas" ? "cinemas" : "films";
  const filmId = film && /^\d+$/.test(film) ? Number(film) : null;

  if (!isCinemaEnabled()) {
    return (
      <>
        <TopBar title="Cinema" />
        <main className="px-5 pb-16 lg:px-10">
          <EmptyState
            title="Orari non disponibili"
            description="La programmazione dei cinema non è ancora attiva."
          />
        </main>
      </>
    );
  }

  const location = await getViewerLocation();
  if (!location) {
    return (
      <>
        <TopBar title="Cinema" />
        <main className="px-5 pb-16 lg:px-10">
          <LocationPrompt />
        </main>
      </>
    );
  }

  const nowMs = Date.now();
  const query = (key: string, value: string) => {
    const p = new URLSearchParams({ day: selected });
    if (filmId) p.set("film", String(filmId));
    p.set(key, value);
    return `/cinema?${p.toString()}`;
  };

  // ?film=<tmdbId>: un solo film, stessa lista della scheda ma senza limite
  if (filmId) {
    const cached = await getOrFetchTitle(filmId, "movie");
    const t = cached?.title ?? null;
    const mgId = t ? await getMovieGluFilmId(t).catch(() => null) : null;
    const [items, { friends }] = await Promise.all([
      mgId != null && t
        ? getFilmShowtimes(location, mgId, t.title, selected).catch(() => [])
        : Promise.resolve([]),
      getFriendsData(),
    ]);
    const summary: FilmSummary | null = t
      ? {
          tmdbId: t.id,
          movieGluFilmId: mgId ?? 0,
          title: t.title,
          posterPath: t.poster_path,
          backdropPath: t.backdrop_path,
        }
      : null;

    return (
      <>
        <TopBar
          title={t?.title ?? "Cinema"}
          action={<LocationChip label={location.label} />}
        />
        <main className="flex flex-col gap-4 px-5 pb-16 lg:px-10">
          <DayBar days={days} selected={selected} />
          <Link
            href={`/cinema?day=${selected}`}
            className="text-[13px] font-medium text-accent-soft"
          >
            ← Tutti i cinema
          </Link>
          {summary && items.length > 0 ? (
            <ShowtimesClient
              film={summary}
              items={items}
              friends={friends}
              nowMs={nowMs}
            />
          ) : (
            <EmptyState
              title="Nessuno spettacolo vicino a te"
              description="Prova un altro giorno o cambia posizione."
            />
          )}
        </main>
      </>
    );
  }

  const cinemas = await getNearbyCinemas(location, 10).catch(() => []);
  const [programmes, { friends }] = await Promise.all([
    Promise.all(
      cinemas.slice(0, 5).map(async (cinema) => ({
        cinema,
        films: await getCinemaProgramme(location, cinema, selected).catch(() => []),
      })),
    ),
    getFriendsData(),
  ]);
  const venues: VenueEntry[] = programmes.filter((v) => v.films.length > 0);
  const films = byFilm(venues);

  return (
    <>
      <TopBar title="Cinema" action={<LocationChip label={location.label} />} />
      <main className="flex flex-col gap-4 px-5 pb-16 lg:px-10">
        <DayBar days={days} selected={selected} />
        <div className="flex gap-2">
          <Link
            href={query("view", "films")}
            className={`${PILL} ${mode === "films" ? "bg-accent text-white" : "border border-border bg-surface text-muted"}`}
          >
            Per film
          </Link>
          <Link
            href={query("view", "cinemas")}
            className={`${PILL} ${mode === "cinemas" ? "bg-accent text-white" : "border border-border bg-surface text-muted"}`}
          >
            Per cinema
          </Link>
        </div>

        {venues.length === 0 ? (
          <EmptyState
            title="Orari non disponibili ora"
            description="Nessuna programmazione trovata vicino a te. Riprova tra poco o cambia posizione."
          />
        ) : mode === "films" ? (
          <FilmsView entries={films} friends={friends} nowMs={nowMs} />
        ) : (
          <VenuesView entries={venues} friends={friends} nowMs={nowMs} />
        )}
      </main>
    </>
  );
}

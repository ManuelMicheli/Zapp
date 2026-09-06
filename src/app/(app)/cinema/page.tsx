import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { FavoritesChip } from "@/components/cinema/FavoritesChip";
import { FilmsView, type FilmEntry } from "@/components/cinema/FilmsView";
import { LocationChip } from "@/components/cinema/LocationChip";
import { LocationPrompt } from "@/components/cinema/LocationPrompt";
import { ShowtimesClient } from "@/components/cinema/ShowtimesClient";
import { VenuesView, type VenueEntry } from "@/components/cinema/VenuesView";
import { EmptyState } from "@/components/ui/EmptyState";
import { romeDateString } from "@/lib/cinema/dates";
import { orderCinemas, orderShowtimes } from "@/lib/cinema/favorites";
import { getSourceFilmId } from "@/lib/cinema/match";
import { isCinemaEnabled } from "@/lib/cinema/source";
import { getFavoriteCinemaIds, getViewerLocation } from "@/lib/cinema/queries";
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
  searchParams: Promise<{ view?: string; film?: string }>;
}

const PILL = "rounded-full px-4 py-1.5 text-xs font-semibold";

/**
 * Aggrega la programmazione dei cinema per film: in testa il cinema preferito che lo
 * dà, altrimenti il più vicino.
 */
function byFilm(venues: VenueEntry[]): FilmEntry[] {
  const map = new Map<number, FilmEntry>();
  for (const { cinema, films } of venues) {
    for (const { film, showings } of films) {
      const cur = map.get(film.sourceFilmId);
      if (!cur) {
        map.set(film.sourceFilmId, { film, cinema, showings, cinemaCount: 1 });
      } else {
        cur.cinemaCount += 1;
        const better =
          !cur.cinema.favorite &&
          (cinema.favorite === true || cinema.distanceKm < cur.cinema.distanceKm);
        if (better) {
          cur.cinema = cinema;
          cur.showings = showings;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.cinemaCount - a.cinemaCount);
}

export default async function CinemaPage({ searchParams }: Props) {
  const { view, film } = await searchParams;
  const today = romeDateString();
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

  const [location, favIds] = await Promise.all([
    getViewerLocation(),
    getFavoriteCinemaIds(),
  ]);
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

  if (!location.provinceSlug) {
    return (
      <>
        <TopBar title="Cinema" action={<LocationChip label={location.label} />} />
        <main className="px-5 pb-16 lg:px-10">
          <EmptyState
            title="Zona non coperta"
            description="MyMovies non ha cinema per la tua provincia. Cambia posizione."
          />
        </main>
      </>
    );
  }

  const nowMs = Date.now();

  // ?film=<tmdbId>: un solo film, stessa lista della scheda ma senza limite
  if (filmId) {
    const cached = await getOrFetchTitle(filmId, "movie");
    const t = cached?.title ?? null;
    const sourceId = t ? await getSourceFilmId(t, location).catch(() => null) : null;
    const [rawItems, { friends }] = await Promise.all([
      sourceId != null && t
        ? getFilmShowtimes(location, sourceId, t.title, today).catch(() => [])
        : Promise.resolve([]),
      getFriendsData(),
    ]);
    const items = orderShowtimes(rawItems, favIds);
    const summary: FilmSummary | null = t
      ? {
          tmdbId: t.id,
          sourceFilmId: sourceId ?? 0,
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
          <Link href="/cinema" className="text-[13px] font-medium text-accent-soft">
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
              description="Prova a cambiare posizione."
            />
          )}
        </main>
      </>
    );
  }

  // Preferiti in testa: il programma si carica per i primi 5, così i loro orari
  // arrivano sempre.
  const cinemas = orderCinemas(
    await getNearbyCinemas(location, 10).catch(() => []),
    favIds,
  );
  const [programmes, { friends }] = await Promise.all([
    Promise.all(
      cinemas.slice(0, 5).map(async (cinema) => ({
        cinema,
        films: await getCinemaProgramme(location, cinema, today).catch(() => []),
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
        <p className="text-[13px] text-muted">Programmazione di oggi</p>
        <div className="flex items-center gap-2">
          <Link
            href="/cinema?view=films"
            className={`${PILL} ${mode === "films" ? "bg-accent text-white" : "border border-border bg-surface text-muted"}`}
          >
            Per film
          </Link>
          <Link
            href="/cinema?view=cinemas"
            className={`${PILL} ${mode === "cinemas" ? "bg-accent text-white" : "border border-border bg-surface text-muted"}`}
          >
            Per cinema
          </Link>
          {cinemas.length > 0 && (
            <div className="ml-auto">
              <FavoritesChip cinemas={cinemas} />
            </div>
          )}
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

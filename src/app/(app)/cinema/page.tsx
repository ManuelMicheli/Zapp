import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { FavoritesChip } from "@/components/cinema/FavoritesChip";
import { FilmsView } from "@/components/cinema/FilmsView";
import { LocationChip } from "@/components/cinema/LocationChip";
import { LocationPrompt } from "@/components/cinema/LocationPrompt";
import { ShowtimesClient } from "@/components/cinema/ShowtimesClient";
import { VenuesView } from "@/components/cinema/VenuesView";
import { EmptyState } from "@/components/ui/EmptyState";
import { romeDateString } from "@/lib/cinema/dates";
import { orderShowtimes } from "@/lib/cinema/favorites";
import { getSourceFilmId } from "@/lib/cinema/match";
import { isCinemaEnabled } from "@/lib/cinema/source";
import { getFavoriteCinemaIds, getViewerLocation } from "@/lib/cinema/queries";
import { getFilmShowtimes } from "@/lib/cinema/showtimes";
import { getTodayProgramme } from "@/lib/cinema/today";
import type { FilmSummary } from "@/lib/cinema/types";
import { getFriendsData } from "@/lib/social/queries";
import { getOrFetchTitle } from "@/lib/tmdb/cache";

export const metadata = { title: "Cinema" };

interface Props {
  searchParams: Promise<{ view?: string; film?: string }>;
}

/** Controllo "Per film | Per cinema": pillola in vetro con la voce attiva in rilievo. */
function ViewSwitch({ mode }: { mode: "films" | "cinemas" }) {
  const item = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className={`flex h-8 items-center rounded-full px-4 text-[13px] font-semibold transition-colors ${
        on
          ? "bg-white/[0.14] text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          : "text-muted hover:text-text"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="glass flex gap-0.5 rounded-full p-[3px]">
      {item("/cinema?view=films", "Per film", mode === "films")}
      {item("/cinema?view=cinemas", "Per cinema", mode === "cinemas")}
    </div>
  );
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
        ? getFilmShowtimes(location, sourceId, t.title, today, t.original_title).catch(
            () => [],
          )
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
              hero
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

  // Programmazione condivisa col banner in home (`getTodayProgramme`, React cache).
  const [{ cinemas, venues, films }, { friends }] = await Promise.all([
    getTodayProgramme(),
    getFriendsData(),
  ]);

  return (
    <>
      <TopBar title="Cinema" action={<LocationChip label={location.label} />} />
      <main className="flex flex-col gap-4 px-5 pb-16 lg:px-10">
        <p className="-mt-2 text-[13px] text-muted">Programmazione di oggi</p>
        <div className="flex items-center justify-between gap-2">
          <ViewSwitch mode={mode} />
          {cinemas.length > 0 && <FavoritesChip cinemas={cinemas} />}
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

import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { DayPills } from "@/components/cinema/DayPills";
import { FavoritesChip } from "@/components/cinema/FavoritesChip";
import { FilmsView } from "@/components/cinema/FilmsView";
import { LocationChip } from "@/components/cinema/LocationChip";
import { LocationPrompt } from "@/components/cinema/LocationPrompt";
import { ShowtimesClient } from "@/components/cinema/ShowtimesClient";
import { VenuesView } from "@/components/cinema/VenuesView";
import { EmptyState } from "@/components/ui/EmptyState";
import { cinemaDays, getDayProgramme, getFilmDays, resolveDay } from "@/lib/cinema/day";
import type { DayOption } from "@/lib/cinema/dates";
import { isCinemaEnabled } from "@/lib/cinema/source";
import { getFavoriteCinemaIds, getViewerLocation } from "@/lib/cinema/queries";
import type { FilmSummary } from "@/lib/cinema/types";
import { getFriendsData } from "@/lib/social/queries";
import { getOrFetchTitle } from "@/lib/tmdb/cache";

export const metadata = { title: "Cinema" };

interface Props {
  searchParams: Promise<{ view?: string; film?: string; day?: string }>;
}

type Mode = "films" | "cinemas";

function hrefFor(mode: Mode, date: string, days: DayOption[]): string {
  const params = new URLSearchParams({ view: mode });
  if (date !== days[0].date) params.set("day", date);
  return `/cinema?${params.toString()}`;
}

/** Controllo "Per film | Per cinema": pillola in vetro con la voce attiva in rilievo. */
function ViewSwitch({
  mode,
  day,
  days,
}: {
  mode: Mode;
  day: DayOption;
  days: DayOption[];
}) {
  const item = (m: Mode, label: string) => (
    <Link
      href={hrefFor(m, day.date, days)}
      className={`flex h-8 items-center rounded-full px-4 text-[13px] font-semibold transition-colors ${
        mode === m
          ? "bg-white/[0.14] text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
          : "text-muted hover:text-text"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="glass flex gap-0.5 rounded-full p-[3px]">
      {item("films", "Per film")}
      {item("cinemas", "Per cinema")}
    </div>
  );
}

/** "Programmazione di oggi" / "di domani" / "di mercoledì 9". */
function subtitle(day: DayOption, days: DayOption[]): string {
  if (day.date === days[0].date) return "Programmazione di oggi";
  if (day.date === days[1]?.date) return "Programmazione di domani";
  const long = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
  }).format(new Date(`${day.date}T12:00:00Z`));
  return `Programmazione di ${long}`;
}

export default async function CinemaPage({ searchParams }: Props) {
  const { view, film, day: dayParam } = await searchParams;
  const mode: Mode = view === "cinemas" ? "cinemas" : "films";
  const filmId = film && /^\d+$/.test(film) ? Number(film) : null;
  const days = cinemaDays();

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
  const geo = { ...location, provinceSlug: location.provinceSlug };
  const nowMs = Date.now();

  // ?film=<tmdbId>: un solo film, stessa lista della scheda (tre giorni) ma senza limite
  if (filmId) {
    const cached = await getOrFetchTitle(filmId, "movie");
    const t = cached?.title ?? null;
    const [filmDays, { friends }] = await Promise.all([
      t ? getFilmDays(geo, t, favIds) : Promise.resolve(null),
      getFriendsData(),
    ]);
    const summary: FilmSummary | null = t
      ? {
          tmdbId: t.id,
          sourceFilmId: filmDays?.sourceId ?? t.id,
          title: t.title,
          posterPath: t.poster_path,
          backdropPath: t.backdrop_path,
        }
      : null;
    const anyShowing = filmDays?.days.some((d) => d.items.length > 0) ?? false;

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
          {summary && filmDays && anyShowing ? (
            <ShowtimesClient
              film={summary}
              days={filmDays.days}
              friends={friends}
              nowMs={nowMs}
              hero
            />
          ) : (
            <EmptyState
              title="Nessuno spettacolo vicino a te"
              description="Non è in programmazione nei prossimi giorni. Prova a cambiare posizione."
            />
          )}
        </main>
      </>
    );
  }

  // Giorno scelto (`?day=`); senza scelta, se oggi non ha ancora un programma (di notte
  // MyMovies non lo ha pubblicato) si passa a domani quando domani ha orari.
  const requested = resolveDay(dayParam, days);
  const [initial, { friends }] = await Promise.all([
    getDayProgramme(requested.date),
    getFriendsData(),
  ]);
  let day = requested;
  let programme = initial;
  let todayMissing = false;
  if (!dayParam && programme.venues.length === 0 && days[1]) {
    const tomorrow = await getDayProgramme(days[1].date);
    if (tomorrow.venues.length > 0) {
      programme = tomorrow;
      day = days[1];
      todayMissing = true;
    }
  }
  const { cinemas, venues, films } = programme;

  return (
    <>
      <TopBar title="Cinema" action={<LocationChip label={location.label} />} />
      <main className="flex flex-col gap-4 px-5 pb-16 lg:px-10">
        <div className="-mt-2 flex flex-wrap items-center justify-between gap-3">
          <DayPills
            days={days}
            active={day.date}
            hrefs={Object.fromEntries(
              days.map((d) => [d.date, hrefFor(mode, d.date, days)]),
            )}
          />
          <p className="text-[13px] text-muted">{subtitle(day, days)}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <ViewSwitch mode={mode} day={day} days={days} />
          {cinemas.length > 0 && <FavoritesChip cinemas={cinemas} />}
        </div>
        {todayMissing && (
          <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-[13px] text-muted">
            Il programma di oggi non è ancora stato pubblicato: ecco quello di domani.
          </p>
        )}

        {venues.length === 0 ? (
          <EmptyState
            title={
              day.date === days[0].date
                ? "Orari di oggi non ancora disponibili"
                : "Nessun orario per questo giorno"
            }
            description={
              day.date === days[0].date
                ? "Il programma del giorno arriva in mattinata. Riprova tra poco o guarda domani."
                : "Le sale indipendenti pubblicano gli orari solo il giorno stesso; le catene vicine non hanno ancora la programmazione."
            }
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

import { GenreBar } from "@/components/profile/GenreBar";
import type { ProfileStats } from "@/lib/profile/stats";

/**
 * Statistiche + "Generi più visti": stessa card sul profilo proprio e su
 * quello di un amico (cambiano solo i titoli), così chi apre il profilo di
 * un altro vede quello che vede lui.
 */
export function ProfileStatsSection({
  stats,
  heading,
}: {
  stats: ProfileStats;
  heading: string;
}) {
  const hours = Math.round(stats.minutes / 60);
  /** Giorni pieni di visione: mostrati solo quando ce n'è almeno uno. */
  const days = Math.floor(stats.minutes / 1440);
  const genreTotal = stats.topGenres.reduce((acc, g) => acc + g.count, 0);
  const statItems = [
    { label: "Film visti", value: stats.filmsWatched },
    { label: "Serie viste", value: stats.seriesWatched },
    { label: "Episodi", value: stats.episodesSeen },
  ];

  return (
    <>
      <section className="flex flex-col gap-3.5 px-5 md:px-0">
        <h2 className="text-xl font-bold tracking-[-0.03em]">{heading}</h2>
        {/* Una sola card: il totale di ore come numero eroe, i conteggi in
            tre riquadri; da lg tutto su una riga, così la card non si
            allunga a vuoto sui monitor larghi. */}
        <div className="flex flex-col gap-4 rounded-[22px] border border-border bg-surface p-5 lg:flex-row lg:items-stretch lg:gap-7 lg:p-6">
          <div className="flex flex-col gap-1.5 lg:w-[230px] lg:shrink-0 lg:justify-center">
            <p className="text-[68px] font-extrabold leading-[0.82] tracking-[-0.06em]">
              {hours}
            </p>
            <p className="text-sm text-muted">ore di film e serie</p>
            <p className="text-xs text-muted-2">
              {stats.watchedTotal} {stats.watchedTotal === 1 ? "titolo" : "titoli"}
              {days > 0 && ` · ${days} ${days === 1 ? "giorno" : "giorni"} di visione`}
            </p>
          </div>
          <div aria-hidden="true" className="h-px bg-border lg:h-auto lg:w-px" />
          <dl className="grid grid-cols-3 gap-2.5 lg:flex-1 lg:gap-3">
            {statItems.map((s) => (
              <div
                key={s.label}
                className="flex flex-col gap-1 rounded-[16px] bg-surface-2 px-3.5 py-3 lg:justify-center lg:gap-1.5 lg:px-5 lg:py-6"
              >
                <dd className="text-[24px] font-bold leading-none tracking-[-0.04em] lg:text-[32px]">
                  {s.value}
                </dd>
                <dt className="text-[11px] leading-tight text-muted lg:text-[13px]">
                  {s.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {stats.topGenres.length > 0 && (
        <section className="mt-9 flex flex-col gap-3.5 px-5 md:px-0">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold tracking-[-0.03em]">Generi più visti</h2>
            <p className="text-xs text-muted">su {stats.watchedTotal} titoli</p>
          </div>
          <GenreBar items={stats.topGenres} total={genreTotal} />
        </section>
      )}
    </>
  );
}

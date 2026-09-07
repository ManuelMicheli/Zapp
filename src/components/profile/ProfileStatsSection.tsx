import { GenreBar } from "@/components/profile/GenreBar";
import type { ProfileStats } from "@/lib/profile/stats";

const NUM = new Intl.NumberFormat("it-IT");

/**
 * Statistiche + "Generi più visti": stesse sezioni sul profilo proprio e su
 * quello di un amico (cambiano solo i titoli), così chi apre il profilo di
 * un altro vede quello che vede lui. Le due parti sono anche esportate da
 * sole: su desktop il profilo di un amico mette i generi nella colonna
 * stretta, accanto alle statistiche.
 */
export function ProfileStatsSection({
  stats,
  heading,
}: {
  stats: ProfileStats;
  heading: string;
}) {
  return (
    <>
      <ProfileStatsCard stats={stats} heading={heading} />
      <ProfileGenres stats={stats} className="mt-10" />
    </>
  );
}

/**
 * Ore, film, serie, episodi. **Nessuna card**: solo tipografia su fondo nero —
 * filo sotto la testata, cifre grandi e leggere (`font-light`, `tabular-nums`,
 * come il conto alla rovescia del cinema) ed etichette minute in maiuscoletto.
 * Da lg le quattro voci stanno su una riga divisa da fili verticali.
 */
export function ProfileStatsCard({
  stats,
  heading,
  className = "",
}: {
  stats: ProfileStats;
  heading: string;
  className?: string;
}) {
  const hours = Math.round(stats.minutes / 60);
  /** Giorni pieni di visione: mostrati solo quando ce n'è almeno uno. */
  const days = Math.floor(stats.minutes / 1440);
  const items = [
    { label: "Ore di visione", value: hours },
    { label: "Film visti", value: stats.filmsWatched },
    { label: "Serie viste", value: stats.seriesWatched },
    { label: "Episodi", value: stats.episodesSeen },
  ];

  return (
    <section className={`flex flex-col px-5 md:px-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 className="text-xl font-bold tracking-[-0.03em]">{heading}</h2>
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-2">
          {NUM.format(stats.watchedTotal)}{" "}
          {stats.watchedTotal === 1 ? "titolo" : "titoli"}
          {days > 0 && ` · ${NUM.format(days)} ${days === 1 ? "giorno" : "giorni"}`}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-8 pt-7 lg:grid-cols-4 lg:gap-x-0">
        {items.map((s) => (
          <div
            key={s.label}
            className="flex flex-col gap-2 lg:border-l lg:border-border lg:pl-7 lg:first:border-l-0 lg:first:pl-0"
          >
            <dd className="text-[44px] font-light leading-[0.85] tracking-[-0.045em] tabular-nums lg:text-[56px]">
              {NUM.format(s.value)}
            </dd>
            <dt className="text-[10px] uppercase tracking-[0.16em] text-muted-2">
              {s.label}
            </dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** "Generi più visti": barra a segmenti + legenda, stessa testata a filo. */
export function ProfileGenres({
  stats,
  className = "",
}: {
  stats: ProfileStats;
  className?: string;
}) {
  if (stats.topGenres.length === 0) return null;
  const genreTotal = stats.topGenres.reduce((acc, g) => acc + g.count, 0);
  return (
    <section className={`flex flex-col px-5 md:px-0 ${className}`}>
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 className="text-xl font-bold tracking-[-0.03em]">Generi più visti</h2>
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-2">
          su {NUM.format(stats.watchedTotal)} titoli
        </p>
      </div>
      <div className="pt-6">
        <GenreBar items={stats.topGenres} total={genreTotal} />
      </div>
    </section>
  );
}

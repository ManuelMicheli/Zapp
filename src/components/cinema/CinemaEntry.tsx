import Image from "next/image";
import Link from "next/link";
import { formatTime } from "@/lib/cinema/dates";
import { filmOfTheDay } from "@/lib/cinema/programme";
import { getViewerLocation } from "@/lib/cinema/queries";
import { isCinemaEnabled } from "@/lib/cinema/source";
import { getTodayProgramme } from "@/lib/cinema/today";
import { backdropUrl, posterUrl } from "@/lib/config";
import { getMovieList } from "@/lib/tmdb/client";
import { Icon } from "./icons";

/**
 * Ingresso alla sezione cinema in home ("Al cinema oggi B · Film del giorno"): il
 * fondale del film dato in più sale vicino all'utente, il suo titolo grande, il
 * prossimo orario e quanti altri film ci sono oggi. Senza posizione (o senza
 * programmazione) resta il banner col fondale del primo film in sala in Italia e
 * l'invito a dire dove si è. Tutto porta a `/cinema`.
 */
export async function CinemaEntry({ className = "" }: { className?: string }) {
  if (!isCinemaEnabled()) return null;
  const location = await getViewerLocation();

  let backdrop: string | null = null;
  let poster: string | null = null;
  const title = "Al cinema oggi";
  let line: string;
  let filmTitle: string | null = null;

  const pick = location?.provinceSlug
    ? filmOfTheDay((await getTodayProgramme()).films, Date.now())
    : null;

  if (pick) {
    const { entry, next, othersToday } = pick;
    filmTitle = entry.film.title;
    backdrop = backdropUrl(entry.film.backdropPath, "original");
    poster = posterUrl(entry.film.posterPath, "w500");
    const sale = entry.cinemaCount === 1 ? "1 sala" : `${entry.cinemaCount} sale`;
    const others =
      othersToday === 0
        ? "l'unico film oggi"
        : othersToday === 1
          ? "un altro film oggi"
          : `altri ${othersToday} film oggi`;
    line = `In ${sale}, il prossimo alle ${formatTime(next.start)} · ${others}`;
  } else {
    // ripiego: il primo film in sala in Italia secondo TMDB (cache Next 1 h)
    const top = await getMovieList("now_playing")
      .then((r) => r.results[0] ?? null)
      .catch(() => null);
    backdrop = backdropUrl(top?.backdrop_path ?? null, "original");
    poster = posterUrl(top?.poster_path ?? null, "w500");
    line = !location
      ? "Dimmi dove sei: sale, orari e biglietti di oggi"
      : !location.provinceSlug
        ? "Zona non coperta: cambia posizione"
        : "Nessuno spettacolo trovato vicino a te oggi";
  }
  const bg = backdrop ?? poster;

  return (
    <section className={`px-5 lg:px-10 ${className}`}>
      <Link
        href="/cinema"
        className="group relative flex min-h-[196px] flex-col justify-end overflow-hidden rounded-[20px] border border-border bg-surface lg:min-h-[320px]"
      >
        {bg && (
          <Image
            src={bg}
            alt=""
            fill
            sizes="100vw"
            quality={95}
            className="object-cover object-[50%_25%] transition-transform duration-700 group-hover:scale-[1.02]"
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0)_35%,rgba(0,0,0,0.65)_70%,rgba(0,0,0,0.95)_100%)]" />

        <span className="glass absolute left-4 top-4 inline-flex h-[30px] max-w-[calc(100%-32px)] items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[12px] font-semibold">
          <Icon name="ticket" size={14} />
          <span className="shrink-0">{title}</span>
          {location && <span className="truncate text-white/60">· {location.label}</span>}
        </span>

        <div className="relative flex items-end justify-between gap-4 p-4 pt-16 lg:px-8 lg:pb-7">
          <div className="flex min-w-0 flex-col gap-1 lg:gap-2">
            <p className="line-clamp-2 text-[24px] font-extrabold leading-[1.02] tracking-[-0.045em] lg:text-[40px]">
              {filmTitle ?? title}
            </p>
            <p className="truncate text-[13px] text-white/75 lg:text-[15px]">{line}</p>
          </div>
          <span className="glass hidden h-12 shrink-0 items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold lg:inline-flex">
            Tutta la programmazione
            <Icon name="chev" size={16} />
          </span>
          <span className="glass flex size-11 shrink-0 items-center justify-center rounded-full lg:hidden">
            <Icon name="chev" size={18} />
          </span>
        </div>
      </Link>
    </section>
  );
}

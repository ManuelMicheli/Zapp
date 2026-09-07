import Image from "next/image";
import Link from "next/link";
import { formatTime } from "@/lib/cinema/dates";
import { filmOfTheDay } from "@/lib/cinema/programme";
import { getViewerLocation } from "@/lib/cinema/queries";
import { isCinemaEnabled } from "@/lib/cinema/source";
import { getTodayProgramme } from "@/lib/cinema/today";
import { backdropUrl, posterUrl } from "@/lib/config";
import { getMovieList } from "@/lib/tmdb/client";
import { BackdropRotator } from "./BackdropRotator";
import { Icon } from "./icons";

/**
 * Ingresso alla sezione cinema in home ("Al cinema oggi B · Film del giorno"): il
 * fondale del film dato in più sale vicino all'utente, il suo titolo grande, il
 * prossimo orario e quanti altri film ci sono oggi. Senza posizione (o senza
 * programmazione) resta il banner col fondale del primo film in sala in Italia e
 * l'invito a dire dove si è. Da `lg`, sulla destra, la **parete di locandine** dei film
 * di oggi (fino a `WALL_MAX`, in prospettiva, ben visibili: il fondale è più velato).
 * Il fondale **ruota in continuo** fra i film in programmazione (`BackdropRotator`,
 * dissolvenza + zoom lento, film del giorno per primo). Tutto porta a `/cinema`.
 */
/** Locandine sulla parete desktop: a 1440px ne entrano ~7 visibili, le altre sfumano a sinistra. */
const WALL_MAX = 9;
/** Fondali nella rotazione: oltre, il giro diventa troppo lungo. */
const ROTATION_MAX = 8;

export async function CinemaEntry({ className = "" }: { className?: string }) {
  if (!isCinemaEnabled()) return null;
  const location = await getViewerLocation();

  let backdrop: string | null = null;
  let poster: string | null = null;
  const title = "Al cinema oggi";
  let line: string;
  let filmTitle: string | null = null;
  /** Locandine per la parete su desktop: i film di oggi, altrimenti quelli in sala in Italia. */
  let wall: { key: number; src: string; title: string }[] = [];
  /** Fondali a rotazione: il film del giorno per primo, poi gli altri che ne hanno uno. */
  let backdrops: string[] = [];

  const programme = location?.provinceSlug ? (await getTodayProgramme()).films : [];
  const pick = filmOfTheDay(programme, Date.now());

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
    wall = programme.flatMap((e) => {
      const src = posterUrl(e.film.posterPath, "w342");
      return src ? [{ key: e.film.sourceFilmId, src, title: e.film.title }] : [];
    });
    backdrops = programme.flatMap((e) => {
      const src = backdropUrl(e.film.backdropPath, "original");
      return src ? [src] : [];
    });
  } else {
    // ripiego: i film in sala in Italia secondo TMDB (cache Next 1 h)
    const list = await getMovieList("now_playing")
      .then((r) => r.results)
      .catch(() => []);
    const top = list[0] ?? null;
    backdrop = backdropUrl(top?.backdrop_path ?? null, "original");
    poster = posterUrl(top?.poster_path ?? null, "w500");
    wall = list.flatMap((r) => {
      const src = posterUrl(r.poster_path ?? null, "w342");
      return src
        ? [{ key: r.id, src, title: r.media_type === "movie" ? r.title : r.name }]
        : [];
    });
    backdrops = list.flatMap((r) => {
      const src = backdropUrl(r.backdrop_path ?? null, "original");
      return src ? [src] : [];
    });
    line = !location
      ? "Dimmi dove sei: sale, orari e biglietti di oggi"
      : !location.provinceSlug
        ? "Zona non coperta: cambia posizione"
        : "Nessuno spettacolo trovato vicino a te oggi";
  }
  // il fondale del film del giorno apre la rotazione; senza fondali resta la locandina
  const slides = [
    ...(backdrop ? [backdrop] : []),
    ...backdrops.filter((b) => b !== backdrop),
  ].slice(0, ROTATION_MAX);
  const bg = slides[0] ?? poster;
  const tiles = wall.slice(0, WALL_MAX);

  return (
    <section className={`px-5 lg:px-10 ${className}`}>
      <Link
        href="/cinema"
        className="group relative flex min-h-[196px] flex-col justify-end overflow-hidden rounded-[20px] border border-border bg-surface lg:min-h-[320px]"
      >
        {slides.length > 1 ? (
          <BackdropRotator sources={slides} />
        ) : (
          bg && (
            <Image
              src={bg}
              alt=""
              fill
              sizes="100vw"
              quality={95}
              className="object-cover object-[50%_25%] transition-transform duration-700 group-hover:scale-[1.02]"
            />
          )
        )}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.4)_0%,rgba(0,0,0,0)_35%,rgba(0,0,0,0.65)_70%,rgba(0,0,0,0.95)_100%)]" />
        {tiles.length > 0 && (
          <div className="absolute inset-0 hidden bg-black/45 lg:block" aria-hidden />
        )}

        {/* parete di locandine, solo desktop: in prospettiva, ancorata a destra, sfuma sotto il testo */}
        {tiles.length > 0 && (
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 hidden w-[68%] items-center justify-end pr-8 lg:flex [mask-image:linear-gradient(90deg,transparent_0%,black_22%)]"
          >
            <div className="flex items-center gap-3.5 [transform:perspective(1400px)_rotateY(-14deg)] [transform-origin:100%_50%]">
              {tiles.map((t, i) => (
                <div
                  key={t.key}
                  className={`relative shrink-0 overflow-hidden rounded-[10px] border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.7)] transition-transform duration-700 group-hover:-translate-y-1 ${
                    i % 2 === 0 ? "h-[236px] w-[158px]" : "mt-8 h-[212px] w-[142px]"
                  }`}
                >
                  <Image
                    src={t.src}
                    alt={t.title}
                    fill
                    sizes="158px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <span className="glass absolute left-4 top-4 inline-flex h-[30px] max-w-[calc(100%-32px)] items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[12px] font-semibold">
          <Icon name="ticket" size={14} />
          <span className="shrink-0">{title}</span>
          {location && <span className="truncate text-white/60">· {location.label}</span>}
        </span>

        <div className="relative flex items-end justify-between gap-4 p-4 pt-16 lg:px-8 lg:pb-7">
          <div className="flex min-w-0 flex-col gap-1 lg:max-w-[42%] lg:gap-2">
            <p className="line-clamp-2 text-[24px] font-extrabold leading-[1.02] tracking-[-0.045em] lg:text-[40px]">
              {filmTitle ?? title}
            </p>
            <p className="truncate text-[13px] text-white/75 lg:text-[15px]">{line}</p>
            <span className="glass mt-3 hidden h-12 w-fit items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold lg:inline-flex">
              Tutta la programmazione
              <Icon name="chev" size={16} />
            </span>
          </div>
          <span className="glass flex size-11 shrink-0 items-center justify-center rounded-full lg:hidden">
            <Icon name="chev" size={18} />
          </span>
        </div>
      </Link>
    </section>
  );
}

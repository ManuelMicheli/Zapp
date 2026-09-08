import Image from "next/image";
import Link from "next/link";
import { cinemaTodayLabel, formatTime } from "@/lib/cinema/dates";
import { filmsWithNext } from "@/lib/cinema/programme";
import { getViewerLocation } from "@/lib/cinema/queries";
import { isCinemaEnabled } from "@/lib/cinema/source";
import { getTodayProgramme } from "@/lib/cinema/today";
import { backdropUrl, posterUrl } from "@/lib/config";
import { getMovieList } from "@/lib/tmdb/client";
import {
  CinemaRotation,
  RotatingBackdrop,
  RotatingCaption,
  type CaptionSlide,
} from "./CinemaRotation";
import { Icon } from "./icons";

/**
 * Ingresso alla sezione cinema in home ("Al cinema oggi B · Film del giorno"): il
 * fondale del film dato in più sale vicino all'utente, il suo titolo grande, il
 * prossimo orario e quanti altri film ci sono oggi. Senza posizione (o senza
 * programmazione) resta il banner col fondale del primo film in sala in Italia e
 * l'invito a dire dove si è. Da `lg`, sulla destra, la **parete di locandine** dei film
 * di oggi (fino a `WALL_MAX`, in prospettiva, ben visibili: il fondale è più velato).
 * Le locandine sono alte una frazione della card (`h-[86%]`/`h-[72%]` a scacchiera, con
 * `aspect-[2/3]`), non un numero di pixel: crescono con la card a ogni larghezza —
 * a 1440px la prima sfiora i 250px invece di 120 — invece di restare francobolli su un
 * monitor grande.
 * Il fondale **ruota in continuo** fra i film che hanno ancora uno spettacolo oggi
 * (`CinemaRotation`, dissolvenza + zoom lento, film del giorno per primo) e **titolo e
 * riga cambiano insieme al fondale** (`RotatingCaption`) a ogni larghezza: da `lg` la
 * stessa didascalia in corpo grande accanto alla parete. Tutto porta a `/cinema`.
 */
/** Locandine sulla parete desktop: le ultime sfumano a sinistra sotto il testo. */
const WALL_MAX = 7;
/** Film nella rotazione: oltre, il giro diventa troppo lungo. */
const ROTATION_MAX = 8;

interface Slide extends CaptionSlide {
  src: string;
}

export async function CinemaEntry({ className = "" }: { className?: string }) {
  if (!isCinemaEnabled()) return null;
  const location = await getViewerLocation();

  // "Al cinema oggi" fino alle 19:30 di Roma, poi "Al cinema stasera"
  const title = cinemaTodayLabel();
  /** Locandine per la parete su desktop: i film di oggi, altrimenti quelli in sala in Italia. */
  let wall: { key: number; src: string; title: string }[] = [];
  /** Fondale + titolo + riga di ogni film del giro: il film del giorno per primo. */
  let slides: Slide[] = [];
  /** Ripiego senza fondali: la locandina del primo film. */
  let poster: string | null = null;
  /** Testo desktop: il film del giorno, fermo accanto alla parete. */
  let filmTitle: string | null = null;
  let line: string;

  const programme = location ? (await getTodayProgramme()).films : [];
  const rotation = filmsWithNext(programme, Date.now());
  const pick = rotation[0];

  if (pick) {
    const othersToday = rotation.length - 1;
    const others =
      othersToday === 0
        ? "l'unico film oggi"
        : othersToday === 1
          ? "un altro film oggi"
          : `altri ${othersToday} film oggi`;
    const lineFor = ({ entry, next }: (typeof rotation)[number]) => {
      const sale = entry.cinemaCount === 1 ? "1 sala" : `${entry.cinemaCount} sale`;
      return `In ${sale}, il prossimo alle ${formatTime(next.start)} · ${others}`;
    };
    filmTitle = pick.entry.film.title;
    line = lineFor(pick);
    poster = posterUrl(pick.entry.film.posterPath, "w500");
    slides = rotation.flatMap((r) => {
      const src = backdropUrl(r.entry.film.backdropPath, "original");
      return src ? [{ src, title: r.entry.film.title, line: lineFor(r) }] : [];
    });
    wall = programme.flatMap((e) => {
      const src = posterUrl(e.film.posterPath, "w500");
      return src ? [{ key: e.film.sourceFilmId, src, title: e.film.title }] : [];
    });
  } else {
    // ripiego: i film in sala in Italia secondo TMDB (cache Next 1 h)
    const list = await getMovieList("now_playing")
      .then((r) => r.results)
      .catch(() => []);
    line = !location
      ? "Dimmi dove sei: sale, orari e biglietti di oggi"
      : "Nessuno spettacolo trovato vicino a te oggi";
    poster = posterUrl(list[0]?.poster_path ?? null, "w500");
    slides = list.flatMap((r) => {
      const src = backdropUrl(r.backdrop_path ?? null, "original");
      const name = r.media_type === "movie" ? r.title : r.name;
      return src ? [{ src, title: name, line }] : [];
    });
    wall = list.flatMap((r) => {
      const src = posterUrl(r.poster_path ?? null, "w500");
      return src
        ? [{ key: r.id, src, title: r.media_type === "movie" ? r.title : r.name }]
        : [];
    });
  }
  slides = slides.slice(0, ROTATION_MAX);
  const tiles = wall.slice(0, WALL_MAX);
  // senza alcun fondale resta la locandina, fissa, col testo del server
  const sources = slides.map((s) => s.src);
  const captions: CaptionSlide[] =
    slides.length > 0 ? slides : [{ title: filmTitle ?? title, line }];

  return (
    <section className={`px-5 lg:px-10 ${className}`}>
      <CinemaRotation count={slides.length}>
        <Link
          href="/cinema"
          className="group relative flex w-full min-h-[196px] flex-col justify-end overflow-hidden rounded-[20px] border border-border bg-surface md:aspect-[32/9] md:min-h-0 lg:aspect-[4/1] lg:min-h-[264px]"
        >
          {sources.length > 0 ? (
            <RotatingBackdrop sources={sources} />
          ) : (
            poster && (
              <Image
                src={poster}
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
              className="absolute inset-y-0 right-0 hidden w-[72%] items-center justify-end py-6 pr-9 lg:flex xl:py-8 [mask-image:linear-gradient(90deg,transparent_0%,black_26%)]"
            >
              <div className="flex h-full items-center gap-4 [transform:perspective(1200px)_rotateY(-17deg)] [transform-origin:100%_50%] xl:gap-5">
                {tiles.map((t, i) => (
                  <div
                    key={t.key}
                    className={`relative aspect-[2/3] shrink-0 overflow-hidden rounded-[14px] shadow-[0_34px_80px_rgba(0,0,0,0.78)] transition-transform duration-700 group-hover:-translate-y-1.5 ${
                      i % 2 === 0
                        ? "h-[86%] self-center xl:h-[90%]"
                        : "h-[72%] self-end xl:h-[76%]"
                    }`}
                  >
                    <Image
                      src={t.src}
                      alt={t.title}
                      fill
                      sizes="(min-width:1536px) 320px, 240px"
                      className="object-cover"
                    />
                    {/* filo di luce sul bordo e riflesso in alto: la parete non è piatta */}
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-[14px] bg-[linear-gradient(190deg,rgba(255,255,255,0.16)_0%,rgba(255,255,255,0)_32%)] ring-1 ring-inset ring-white/15"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <span className="glass absolute left-4 top-4 inline-flex h-[30px] max-w-[calc(100%-32px)] items-center gap-1.5 rounded-full pl-2.5 pr-3 text-[12px] font-semibold">
            <Icon name="ticket" size={14} />
            <span className="shrink-0">{title}</span>
            {location && (
              <span className="truncate text-white/60">· {location.label}</span>
            )}
          </span>

          <div className="relative flex items-end justify-between gap-4 p-4 pt-16 lg:px-8 lg:pb-7">
            {/* il testo segue il fondale, su telefono come su desktop */}
            <div className="flex min-w-0 flex-col lg:max-w-[42%]">
              <RotatingCaption slides={captions} />
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
      </CinemaRotation>
    </section>
  );
}

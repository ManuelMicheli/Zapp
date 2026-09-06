import Image from "next/image";
import { backdropUrl, posterUrl } from "@/lib/config";
import { BackButton } from "@/components/layout/BackButton";
import type { Tables } from "@/types/database";
import type { Trailer } from "@/lib/trailers/frame";
import { CinematicBackdrop } from "./CinematicBackdrop";

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Subito sotto la banda, a tutte le larghezze: sfumatura dal nero pieno (bordo del
 * trailer) al trasparente in 320px, sopra lo sfondo "ambient": la pagina colorata
 * comincia dopo un respiro nero, e locandina e titolo poggiano su quel nero. È ancorata
 * al bordo basso reale della banda (`top-full` nel wrapper `relative` `BAND_WRAP_CLASS`),
 * non a `56.25vw`: la banda è larga quanto `PageShell` (390 − 2px di bordo), quindi
 * 218,25px e non 219,4, e nel varco di 1px trasparì lo sfondo ambient come una riga
 * chiara. Nessuna maschera né velo colorato sul video: il trailer arriva nudo al bordo
 * della banda, poi il nero, poi i colori.
 */
export const BAND_BLACK_FADE =
  "linear-gradient(180deg, #000000 0%, rgba(0,0,0,0.92) 28%, rgba(0,0,0,0.6) 58%, rgba(0,0,0,0) 100%)";
export const BAND_BLACK_FADE_CLASS =
  "pointer-events-none absolute inset-x-0 top-full h-[320px]";

/**
 * **La banda ha sempre la stessa misura**, con o senza trailer, in scheda titolo e in
 * pagina stagione: 16:9 a tutta larghezza sotto `lg` (il rapporto dei backdrop TMDB),
 * alta il 75% del viewport (`75svh`) a tutta larghezza da `lg`. Il trailer ci sta dentro
 * in "contain" della sua immagine reale (`playerBox` in `CinematicBackdrop`): **intero,
 * mai ritagliato né ingrandito**; dove non arriva (un 2,39:1 in una banda 16:9, un 16:9
 * nel fondale largo da `lg`) resta nero, perché l'immagine di sfondo sfuma quando parte
 * il video. Da `lg` su 1920×1080 (banda ~1920×760) un 16:9 è mostrato a ~1350×760 e un
 * 2,39:1 a ~1820×760: un trailer 1080p viene solo ridotto, mai ingrandito oltre i suoi
 * pixel.
 *
 * Sotto `lg` la banda comincia dopo un respiro nero di safe-area + 64px (padding del
 * wrapper, non margine: un margine collasserebbe fuori da header e `main` e sposterebbe
 * anche `--band-end`) che ospita i comandi in vetro (Indietro, audio, Condividi: 40px a
 * safe-area + 12) **fuori dal video**, così non coprono nulla del trailer, e in
 * standalone la status bar non copre il trailer. Da `lg` la TopNav è in alto, trasparente
 * sopra la banda, il respiro non serve e i comandi stanno ai due angoli del fondale.
 */
export const BAND_WRAP_CLASS =
  "relative pt-[calc(env(safe-area-inset-top,0px)+64px)] lg:pt-0";
export const BAND_CLASS = "aspect-video lg:aspect-auto lg:h-[75svh]";
/**
 * Bordo basso della banda per `--band-end` di `AmbientBackdrop`: respiro + 100vw × 9/16
 * sotto `lg`, `75svh` da `lg` (stessi valori letterali di `BAND_WRAP_CLASS`/`BAND_CLASS`:
 * Tailwind genera solo classi scritte per esteso).
 */
export const BAND_END_CLASS =
  "[--band-end:calc(env(safe-area-inset-top,0px)+64px+56.25vw)] lg:[--band-end:75svh]";

/**
 * Da `lg`, dove i comandi in vetro stanno sopra il video: una lieve sfumatura nera sul
 * bordo alto (speculare a `BAND_BLACK_FADE` in basso) li rende leggibili; il video sotto
 * resta nudo. Sotto `lg` i comandi sono fuori dal video e il velo non c'è.
 */
export const BAND_TOP_FADE =
  "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0) 100%)";
export const BAND_TOP_FADE_CLASS =
  "pointer-events-none absolute inset-x-0 top-0 hidden h-1/2 lg:block";

/**
 * Comandi (Indietro, pillola audio/Condividi) in vetro: sotto lg nel respiro nero sopra
 * la banda (safe-area + 12, bottoni alti 40, poi 12 di aria e il video); da lg ai due
 * angoli del fondale, alla quota standard dei bottoni in testata, safe-area +
 * `--nav-top` (72) + 20.
 */
export const HEADER_BACK_CLASS =
  "absolute left-5 top-[calc(env(safe-area-inset-top,0px)+12px)] z-20 lg:left-10 lg:top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)]";
export const HEADER_CONTROLS_SLOT_CLASS =
  "absolute right-5 top-[calc(env(safe-area-inset-top,0px)+12px)] z-20 lg:right-10 lg:top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)]";

/**
 * Riga con locandina e titolo, sotto la banda a tutte le larghezze (sul nero di
 * `BAND_BLACK_FADE`): mai sopra il video, che resta intero e senza veli.
 */
export const HEADER_ROW_CLASS =
  "relative mt-4 flex items-end gap-4 px-5 md:px-8 lg:mt-6 lg:gap-6 lg:px-10";

export function TitleHeader({
  title,
  trailers,
}: {
  title: Tables<"titles">;
  /** Trailer italiani ufficiali con riquadro (`getOfficialTrailers`, calcolati da `TitleBody`). */
  trailers: Trailer[];
}) {
  // original: il backdrop copre tutta la larghezza desktop, niente upscaling
  const backdrop = backdropUrl(title.backdrop_path, "original");
  const poster = posterUrl(title.poster_path, "w500");
  const year = title.release_date?.slice(0, 4);
  const genres = (title.genres as { id: number; name: string }[] | null) ?? [];

  // meta separati da virgola: "2023, 4 stagioni, 30 episodi"
  const meta: string[] = [];
  if (year) meta.push(year);
  if (title.media_type === "movie" && title.runtime) {
    meta.push(formatRuntime(title.runtime));
  }
  if (title.media_type === "tv" && title.number_of_seasons) {
    meta.push(
      `${title.number_of_seasons} stagion${title.number_of_seasons === 1 ? "e" : "i"}`,
    );
    if (title.number_of_episodes) meta.push(`${title.number_of_episodes} episodi`);
  }

  return (
    // respiro nero con i comandi (solo sotto lg), banda fissa con il trailer intero,
    // sfumatura nera, poi locandina e titolo: stessa struttura a tutte le larghezze
    <header className="relative w-full">
      {/* wrapper `relative`: respiro sopra la banda e bordo basso reale della banda per
        BAND_BLACK_FADE */}
      <div className={BAND_WRAP_CLASS}>
        <div className={`relative w-full overflow-hidden bg-black ${BAND_CLASS}`}>
          <CinematicBackdrop
            image={backdrop}
            trailers={trailers}
            label={`Trailer di ${title.title}`}
            shareTitle={title.title}
          />
          <div
            aria-hidden
            className={BAND_TOP_FADE_CLASS}
            style={{ background: BAND_TOP_FADE }}
          />
        </div>

        {/* il trailer finisce intero sul bordo della banda, poi una sfumatura nera apre
          sulla pagina colorata (AmbientBackdrop) */}
        <div
          aria-hidden
          className={BAND_BLACK_FADE_CLASS}
          style={{ background: BAND_BLACK_FADE }}
        />
      </div>

      <div className={HEADER_BACK_CLASS}>
        <BackButton inline />
      </div>
      {/* qui `CinematicBackdrop` monta la pillola comandi (portal) */}
      <div data-header-controls className={HEADER_CONTROLS_SLOT_CLASS} />

      <div className={HEADER_ROW_CLASS}>
        <div className="relative h-[165px] w-[110px] shrink-0 overflow-hidden rounded-[14px] border border-white/[0.08] bg-surface-2 shadow-[0_20px_50px_rgba(0,0,0,0.7)] lg:h-[252px] lg:w-[168px]">
          {poster && (
            <Image
              src={poster}
              alt={title.title}
              fill
              quality={90}
              sizes="(min-width: 1024px) 168px, 110px"
              className="object-cover"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-2.5 pb-1">
          <h1 className="line-clamp-3 text-[38px] font-extrabold leading-[1.05] tracking-[-0.05em] lg:text-[56px]">
            {title.title}
          </h1>
          {meta.length > 0 && (
            <p className="text-[13px] text-white/70">{meta.join(", ")}</p>
          )}
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {genres.slice(0, 4).map((g) => (
                <span
                  key={g.id}
                  className="glass flex h-7 items-center rounded-full px-[11px] text-xs font-medium"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

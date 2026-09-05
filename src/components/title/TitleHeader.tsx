import Image from "next/image";
import { backdropUrl, posterUrl } from "@/lib/config";
import { BackButton } from "@/components/layout/BackButton";
import type { TmdbVideos } from "@/lib/tmdb/types";
import type { Tables } from "@/types/database";
import { CinematicBackdrop } from "./CinematicBackdrop";
import { getOfficialTrailerKeys } from "@/lib/trailers/official";

function formatRuntime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Velo sul fondale desktop: appena accennato in alto (solo per leggere i bottoni in
 * vetro), immagine/trailer nudi per quasi due terzi del riquadro, poi un velo scuro
 * dove poggiano titolo e locandina. Non arriva mai al nero pieno: il nero lo dà la
 * dissolvenza (`HEADER_MASK_CLASS`), che lascia trasparire lo sfondo "ambient" della
 * scheda (`AmbientBackdrop`, colori della locandina).
 */
export const HEADER_FADE =
  "linear-gradient(180deg, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0) 14%, rgba(0,0,0,0) 62%, rgba(0,0,0,0.3) 82%, rgba(0,0,0,0.55) 100%)";

/**
 * Dissolvenza del fondale desktop nella pagina (solo da `lg`): una maschera sfuma
 * immagine e trailer da opachi a trasparenti nell'ultimo terzo del riquadro, così il
 * video non finisce su un bordo ma si scioglie nello sfondo colorato della scheda.
 * Sotto `lg` nessuna maschera: la banda 16:9 mostra il trailer al 100%, intero fino
 * al bordo.
 */
export const HEADER_MASK_CLASS =
  "lg:[mask-image:linear-gradient(to_bottom,#000_66%,transparent_100%)]";

/**
 * Sotto `lg`, subito sotto la banda: sfumatura dal nero pieno (bordo del trailer) al
 * trasparente in 320px, sopra lo sfondo "ambient": la pagina colorata comincia dopo un
 * respiro nero, e locandina e titolo poggiano su quel nero. È ancorata al bordo basso
 * reale della banda (`top-full` in un wrapper `relative lg:contents`), non a `56.25vw`:
 * la banda è larga quanto `PageShell` (390 − 2px di bordo), quindi 218,25px e non 219,4,
 * e nel varco di 1px trasparì lo sfondo ambient come una riga chiara.
 */
export const BAND_BLACK_FADE =
  "linear-gradient(180deg, #000000 0%, rgba(0,0,0,0.92) 28%, rgba(0,0,0,0.6) 58%, rgba(0,0,0,0) 100%)";
export const BAND_BLACK_FADE_CLASS =
  "pointer-events-none absolute inset-x-0 top-full h-[320px] lg:hidden";

/**
 * Sotto `lg` la banda è 16:10 (`aspect-[16/10]`, 62,5vw) e comincia dopo un respiro nero
 * di safe-area + 16px (padding del wrapper `BAND_WRAP_CLASS`, non margine: un margine
 * collasserebbe fuori da header e `main` e sposterebbe anche `--band-end`): non è
 * incollata al bordo alto e in standalone la status bar non copre il trailer (come la
 * testata di Netflix su telefono). Il trailer 16:9 copre la banda in altezza e perde solo
 * ~5% per lato; la definizione resta quella del player a 5× (vedi `CinematicBackdrop`).
 * Da `lg` il wrapper è `contents` e la banda è il fondale alto assoluto.
 */
export const BAND_WRAP_CLASS =
  "relative pt-[calc(env(safe-area-inset-top,0px)+16px)] lg:contents";
export const BAND_CLASS = "aspect-[16/10] lg:aspect-auto";
/** Bordo basso della banda sotto `lg` (respiro + 62,5vw), per `--band-end` di `AmbientBackdrop`. */
export const BAND_END_CLASS =
  "[--band-end:calc(env(safe-area-inset-top,0px)+16px+62.5vw)]";

/**
 * Una lieve sfumatura nera sul bordo alto del video (speculare a `BAND_BLACK_FADE` in
 * basso) rende leggibili i bottoni in vetro; il video sotto resta nudo.
 */
export const BAND_TOP_FADE =
  "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0) 100%)";

/**
 * Comandi (Indietro, pillola audio/Condividi) in vetro sul bordo alto del video: sotto
 * lg 12px dentro la banda (safe-area + 16 di respiro + 12); da lg alla quota standard
 * dei bottoni in testata, safe-area + `--nav-top` (72) + 20.
 */
export const HEADER_BACK_CLASS =
  "absolute left-5 top-[calc(env(safe-area-inset-top,0px)+28px)] z-20 lg:left-10 lg:top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)]";
export const HEADER_CONTROLS_SLOT_CLASS =
  "absolute right-5 top-[calc(env(safe-area-inset-top,0px)+28px)] z-20 lg:right-10 lg:top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)]";
export async function TitleHeader({ title }: { title: Tables<"titles"> }) {
  // original: il backdrop copre tutta la larghezza desktop, niente upscaling
  const backdrop = backdropUrl(title.backdrop_path, "original");
  const poster = posterUrl(title.poster_path, "w500");
  const year = title.release_date?.slice(0, 4);
  const genres = (title.genres as { id: number; name: string }[] | null) ?? [];
  // solo trailer italiani da canali ufficiali dei distributori (oEmbed + ricerca YouTube)
  const trailerKeys = await getOfficialTrailerKeys({
    videos: (title.raw as { videos?: TmdbVideos } | null)?.videos,
    titleId: title.id,
    mediaType: title.media_type,
    name: title.title,
    releaseDate: title.release_date,
  });

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
    // sotto lg: respiro nero, banda 16:10 (dietro i comandi), poi locandina e titolo;
    // da lg: fondale alto con locandina e titolo appoggiati in basso
    <header className="relative w-full lg:h-[880px]">
      {/* wrapper solo sotto lg (`lg:contents`): respiro sopra la banda e bordo basso reale
        della banda per BAND_BLACK_FADE */}
      <div className={BAND_WRAP_CLASS}>
        <div
          className={`relative w-full overflow-hidden lg:absolute lg:inset-x-0 lg:top-0 lg:h-[800px] ${BAND_CLASS} ${HEADER_MASK_CLASS}`}
        >
          <CinematicBackdrop
            image={backdrop}
            trailerKeys={trailerKeys}
            label={`Trailer di ${title.title}`}
            shareTitle={title.title}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1/2 lg:hidden"
            style={{ background: BAND_TOP_FADE }}
          />
          <div
            className="pointer-events-none absolute inset-0 hidden lg:block"
            style={{ background: HEADER_FADE }}
          />
        </div>

        {/* sotto lg: il trailer finisce intero sul bordo della banda, poi una sfumatura nera
          apre sulla pagina colorata (AmbientBackdrop) */}
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

      <div className="relative mt-4 flex items-end gap-4 px-5 md:px-8 lg:absolute lg:inset-x-10 lg:bottom-4 lg:mt-0 lg:gap-6 lg:px-0">
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

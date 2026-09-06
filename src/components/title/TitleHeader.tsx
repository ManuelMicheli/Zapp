import Image from "next/image";
import type { CSSProperties } from "react";
import { backdropUrl, posterUrl } from "@/lib/config";
import { BackButton } from "@/components/layout/BackButton";
import type { Tables } from "@/types/database";
import type { Trailer } from "@/lib/trailers/frame";
import { frameAspect } from "@/lib/trailers/frame-bars";
import { CinematicBackdrop } from "./CinematicBackdrop";

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
 * Sotto `lg` la banda comincia dopo un respiro nero di safe-area + 16px (padding del
 * wrapper `BAND_WRAP_CLASS`, non margine: un margine collasserebbe fuori da header e
 * `main` e sposterebbe anche `--band-end`): non è incollata al bordo alto e in standalone
 * la status bar non copre il trailer (come la testata di Netflix su telefono).
 * Da `lg` il wrapper è `contents` e la banda è il fondale alto in flusso nella testata.
 *
 * **Forma della banda** (`bandGeometry`): con un trailer la banda ha esattamente il
 * rapporto dell'immagine reale del video (16:9 meno le bande nere di YouTube,
 * `frameAspect`), a tutte le larghezze: il trailer si vede **intero, mai ritagliato né
 * ingrandito**, e nessun pixel della banda è nero, nemmeno ai lati. Da `lg` il fondale
 * è quindi alto quanto la larghezza della pagina divisa per quel rapporto (un 16:9 su
 * 1920px è alto 1080px, un 2,39:1 803px): nessun tetto, perché un tetto lascerebbe
 * colonne nere ai lati. Senza trailer resta il disegno base: 16:10 sotto `lg`, altezza
 * fissa da `lg` (scheda 800px, stagione 580px).
 */
export const BAND_WRAP_CLASS =
  "relative pt-[calc(env(safe-area-inset-top,0px)+16px)] lg:contents";
export const BAND_CLASS = "aspect-(--band-aspect) lg:h-(--fondale-h)";
/** Bordo basso della banda per `--band-end` di `AmbientBackdrop` (valori da `bandGeometry`). */
export const BAND_END_CLASS =
  "[--band-end:var(--band-end-sm)] lg:[--band-end:var(--band-end-lg)]";

/** Banda senza trailer sotto `lg`: 16:10, come la scheda titolo di Netflix su telefono. */
const BAND_ASPECT_DEFAULT = 16 / 10;

/**
 * Variabili CSS della banda: `box` va sul riquadro (`BAND_CLASS`), `ambient` su
 * `AmbientBackdrop` (`BAND_END_CLASS`). `aspect` è il rapporto dell'immagine del trailer
 * (null senza trailer); `desktopHeight` l'altezza fissa da `lg` senza trailer.
 */
export function bandGeometry(
  aspect: number | null,
  desktopHeight: number,
): { box: CSSProperties; ambient: CSSProperties } {
  const a = (aspect ?? BAND_ASPECT_DEFAULT).toFixed(4);
  return {
    box: {
      "--band-aspect": a,
      "--fondale-h": aspect ? "auto" : `${desktopHeight}px`,
    } as CSSProperties,
    ambient: {
      "--band-end-sm": `calc(env(safe-area-inset-top, 0px) + 16px + 100vw / ${a})`,
      "--band-end-lg": aspect ? `calc(100vw / ${a})` : `${desktopHeight}px`,
    } as CSSProperties,
  };
}

/** Rapporto dell'immagine reale del primo trailer (quello che dà forma alla banda). */
export function trailersAspect(trailers: Trailer[]): number | null {
  return trailers.length > 0 ? frameAspect(trailers[0].frame) : null;
}

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
/** Altezza del fondale della scheda titolo da `lg` senza trailer (vedi `bandGeometry`). */
export const TITLE_DESKTOP_HEIGHT = 800;

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
  const band = bandGeometry(trailersAspect(trailers), TITLE_DESKTOP_HEIGHT);

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
    // sotto lg: respiro nero, banda a forma di trailer (dietro i comandi), poi locandina
    // e titolo; da lg: fondale alto con locandina e titolo appoggiati in basso, che
    // sporgono di 80px (`pb-20`) sotto il riquadro
    <header className="relative w-full lg:pb-20">
      {/* wrapper solo sotto lg (`lg:contents`): respiro sopra la banda e bordo basso reale
        della banda per BAND_BLACK_FADE */}
      <div className={BAND_WRAP_CLASS}>
        <div
          className={`relative w-full overflow-hidden bg-black ${BAND_CLASS} ${HEADER_MASK_CLASS}`}
          style={band.box}
        >
          <CinematicBackdrop
            image={backdrop}
            trailers={trailers}
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

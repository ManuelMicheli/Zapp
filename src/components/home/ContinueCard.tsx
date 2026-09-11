import Image from "next/image";
import Link from "next/link";
import { playbackHref } from "@/lib/links/playback";
import type { ContinueItem } from "@/lib/watch/continue";
import { LivePlay, LiveProgress } from "./LiveProgress";
import { PlaybackLink } from "./PlaybackLink";

/**
 * Tessera di "Continua a guardare": una **grafica ufficiale del titolo** in 16:9
 * — mai il fotogramma dell'episodio (richiesta utente 2026-09-07) —, durata e
 * avanzamento sopra l'immagine, titolo e "S1:E5" sotto. L'immagine cambia a ogni
 * visita (rotazione in `src/lib/tmdb/backdrops.ts`) ed è chiesta in taglia
 * `original`: il loader (`src/lib/image-loader.ts`) scende alla taglia TMDB più
 * piccola che copre la larghezza reale, quindi su un telefono a DPR 3 arriva
 * w780/w1280, mai un w300 sgranato.
 */
export function ContinueCard({ item }: { item: ContinueItem }) {
  const href = `/title/${item.mediaType}/${item.titleId}`;
  const playHref = playbackHref(
    item.mediaType,
    item.titleId,
    item.providerId,
    item.shownSeason,
    item.shownEpisode,
    item.providerUrl,
  );
  const meta = [item.episodeLabel, item.episodeName].filter(Boolean).join(" · ");
  return (
    <div className="w-[280px] shrink-0 lg:w-[380px]">
      <div className="relative aspect-video w-full overflow-hidden rounded-[14px] bg-surface-2">
        <Link href={href} className="absolute inset-0">
          {item.imageUrl && (
            <Image
              src={item.imageUrl}
              alt=""
              fill
              sizes="(max-width: 1024px) 280px, 380px"
              className="object-cover"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
        </Link>

        {/* Minutaggio e barra: fermi come li ha resi il server, oppure in
            movimento se un dispositivo collegato sta riproducendo proprio
            questo. Sta fuori dal Link ma sopra di esso, quindi non riceve
            click (vedi `pointer-events-none` dentro). */}
        <LiveProgress
          identity={{
            titleId: item.titleId,
            mediaType: item.mediaType,
            season: item.shownSeason,
            episode: item.shownEpisode,
          }}
          positionMs={item.resumePositionMs}
          durationMs={item.resumeDurationMs}
        />

        {item.providerRecorded && item.providerName && (
          <span
            className="pointer-events-none absolute left-2.5 top-2.5 flex min-h-9 min-w-9 items-center justify-center overflow-hidden rounded-[10px] border border-white/15 bg-black/45 shadow-md backdrop-blur-md"
            title={`Stai guardando su ${item.providerName}`}
          >
            {item.providerLogoUrl ? (
              <Image
                src={item.providerLogoUrl}
                alt={item.providerName}
                width={36}
                height={36}
                sizes="36px"
                className="size-9 object-contain"
              />
            ) : (
              <span className="px-2.5 text-[11px] font-semibold text-white">
                {item.providerName}
              </span>
            )}
          </span>
        )}

        {playHref && (
          <LivePlay
            identity={{
              titleId: item.titleId,
              mediaType: item.mediaType,
              season: item.shownSeason,
              episode: item.shownEpisode,
            }}
          >
            <PlaybackLink
              href={playHref}
              providerId={item.providerId}
              ariaLabel={`Riprendi${item.episodeLabel ? ` ${item.episodeLabel}` : ""} su ${item.providerName ?? "la piattaforma"}`}
              className="glass absolute right-2.5 top-2.5 flex size-9 items-center justify-center rounded-full"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" />
              </svg>
            </PlaybackLink>
          </LivePlay>
        )}
      </div>

      <Link href={href} className="mt-2 block">
        <p className="truncate text-[14px] font-medium leading-tight">{item.name}</p>
        {meta && <p className="mt-0.5 truncate text-[12px] text-muted">{meta}</p>}
      </Link>
    </div>
  );
}

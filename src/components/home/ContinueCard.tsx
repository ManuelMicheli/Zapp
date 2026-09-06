import Image from "next/image";
import Link from "next/link";
import type { ContinueItem } from "@/lib/watch/continue";

/**
 * Tessera di "Continua a guardare": il fotogramma dell'episodio da riprendere
 * (backdrop per i film) in 16:9, durata e avanzamento sopra l'immagine, titolo e
 * "S1:E5" sotto. Il fotogramma è chiesto in taglia `original`: il loader
 * (`src/lib/image-loader.ts`) scende alla taglia TMDB più piccola che copre la
 * larghezza reale, quindi su un telefono a DPR 3 arriva w780/w1280, mai un w300 sgranato.
 */
export function ContinueCard({ item }: { item: ContinueItem }) {
  const href = `/title/${item.mediaType}/${item.titleId}`;
  const meta = [item.episodeLabel, item.episodeName].filter(Boolean).join(" · ");

  return (
    <div className="w-[240px] shrink-0 lg:w-[300px]">
      <div className="relative aspect-video w-full overflow-hidden rounded-[14px] bg-surface-2">
        <Link href={href} className="absolute inset-0">
          {item.imageUrl && (
            <Image
              src={item.imageUrl}
              alt=""
              fill
              sizes="(max-width: 1024px) 240px, 300px"
              className="object-cover"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
          {item.runtimeLabel && (
            <span className="absolute bottom-[18px] left-3 text-[15px] font-semibold leading-none text-white drop-shadow">
              {item.runtimeLabel}
            </span>
          )}
        </Link>

        {item.providerUrl && (
          <a
            href={item.providerUrl}
            target="_blank"
            rel="noopener"
            aria-label={`Guarda su ${item.providerName ?? "la piattaforma"}`}
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
          </a>
        )}

        {item.progressPct != null && (
          <div className="pointer-events-none absolute inset-x-3 bottom-2.5 h-[3px] overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(2, Math.round(item.progressPct * 100))}%` }}
            />
          </div>
        )}
      </div>

      <Link href={href} className="mt-2 block">
        <p className="truncate text-[14px] font-medium leading-tight">{item.name}</p>
        {meta && <p className="mt-0.5 truncate text-[12px] text-muted">{meta}</p>}
      </Link>
    </div>
  );
}

import Image from "next/image";
import Link from "next/link";
import type { ContinueItem } from "@/lib/watch/continue";
import { LiveProgress } from "./LiveProgress";

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
  const meta = [item.episodeLabel, item.episodeName].filter(Boolean).join(" · ");
  // Col minuto esatto dall'estensione ZConnection si sostituisce la durata totale
  // e l'avanzamento a episodi con la posizione vera; senza, tutto come prima.
  // Questi due sono il punto di partenza: mentre si guarda, `LiveProgress` li
  // rimpiazza col minutaggio che scorre.
  const timeLabel = item.resumeLabel ?? item.runtimeLabel;
  const ratio = item.resumeRatio ?? item.progressPct;

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
          label={timeLabel}
          ratio={ratio}
        />

        {item.providerUrl && (
          <a
            href={item.providerUrl}
            target="_blank"
            rel="noopener noreferrer"
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

      </div>

      <Link href={href} className="mt-2 block">
        <p className="truncate text-[14px] font-medium leading-tight">{item.name}</p>
        {meta && <p className="mt-0.5 truncate text-[12px] text-muted">{meta}</p>}
      </Link>
    </div>
  );
}

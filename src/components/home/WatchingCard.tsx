import Image from "next/image";
import Link from "next/link";

export interface WatchingCardProps {
  titleId: number;
  mediaType: "movie" | "tv";
  name: string;
  posterUrl: string | null;
  providerLogoUrl: string | null;
  providerName: string | null;
  /** "S1 E3", solo per le serie. */
  progressLabel: string | null;
  progressPct: number | null;
}

/**
 * Locandina della sezione "In corso": logo provider e barra di avanzamento.
 * Le azioni (Continua, +1 ep) vivono nell'hero, non qui.
 */
export function WatchingCard(props: WatchingCardProps) {
  return (
    <Link
      href={`/title/${props.mediaType}/${props.titleId}`}
      className="block w-28 shrink-0 lg:w-[140px]"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-surface-2">
        {props.posterUrl && (
          <Image
            src={props.posterUrl}
            alt={props.name}
            fill
            sizes="(max-width: 1024px) 112px, 140px"
            className="object-cover"
          />
        )}
        {props.providerLogoUrl && (
          <Image
            src={props.providerLogoUrl}
            alt={props.providerName ?? ""}
            width={22}
            height={22}
            className="absolute bottom-2.5 left-1.5 size-[22px] rounded-md border border-black/50"
          />
        )}
        {props.progressPct != null && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/50">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.round(props.progressPct * 100)}%` }}
            />
          </div>
        )}
      </div>
      <p className="mt-2 truncate text-[13px] font-medium leading-tight">{props.name}</p>
      {props.progressLabel && (
        <p className="mt-0.5 text-[11px] text-muted">{props.progressLabel}</p>
      )}
    </Link>
  );
}

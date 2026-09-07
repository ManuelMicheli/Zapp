import Image from "next/image";
import Link from "next/link";
import { posterUrl, providerLogoUrl } from "@/lib/config";

export interface PosterCardProvider {
  id: number;
  name: string;
  logoPath: string | null;
}

export function PosterCard({
  title,
  posterPath,
  year,
  rating,
  affinity = null,
  showNoRating = false,
  providers = [],
  href,
  preview = false,
  className = "",
  chartBadge = null,
  sizes = "(max-width: 480px) 33vw, 160px",
}: {
  title: string;
  posterPath: string | null;
  year?: string | null;
  /** Voto (0-10) mostrato sotto il titolo; `null` = titolo senza voto. */
  rating?: number | null;
  /**
   * Affinità personale 0-100 ("per te 92%"): la accende la fase C dell'algoritmo.
   * Finché è `null` non si vede niente, così i componenti non andranno più toccati.
   */
  affinity?: number | null;
  /** Mostra "Senza voto" quando `rating` è esplicitamente `null`. */
  showNoRating?: boolean;
  providers?: PosterCardProvider[];
  href?: string;
  /**
   * Dichiara la copertina al `PreviewLayer` (home): fermandoci sopra il mouse, su
   * desktop, si apre la scheda di anteprima col trailer. La card resta un componente
   * server: qui esce solo un attributo.
   */
  preview?: boolean;
  className?: string;
  /**
   * Pillola in alto a sinistra: la posizione in classifica ("#3 su Netflix") oppure
   * "in salita". La posizione ha la precedenza. Oggi le classifiche che scriviamo sono
   * tutte da 10 posizioni, quindi il ramo "in salita" non si vede mai sulle locandine —
   * resta per il giorno in cui una fonte ne desse di più lunghe. Lo scaffale
   * "In salita questa settimana" funziona comunque, perché non passa di qui.
   */
  chartBadge?: { rank: number; providerName: string; rising: boolean } | null;
  /**
   * Larghezza reale della copertina nel layout: il loader TMDB ne ricava la taglia
   * più piccola che la copre. Chi mette le card in una griglia larga deve passarlo,
   * altrimenti si prende un `w342` scalato in su, cioè sgranato.
   */
  sizes?: string;
}) {
  const src = posterUrl(posterPath, "w342");

  const card = (
    <div
      className={`group cv-auto ${className}`}
      data-preview={preview && href ? href : undefined}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[14px] bg-surface-2">
        {src ? (
          <Image
            src={src}
            alt={title}
            fill
            sizes={sizes}
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">
            {title}
          </div>
        )}
        {chartBadge && (chartBadge.rank <= 10 || chartBadge.rising) && (
          <span className="glass absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold">
            {chartBadge.rank <= 10
              ? `#${chartBadge.rank} su ${chartBadge.providerName}`
              : "↑ in salita"}
          </span>
        )}
        {providers.length > 0 && (
          <div className="absolute bottom-1.5 left-1.5 flex gap-1">
            {providers.slice(0, 3).map((p) => {
              const logo = providerLogoUrl(p.logoPath);
              return logo ? (
                <Image
                  key={p.id}
                  src={logo}
                  alt={p.name}
                  title={p.name}
                  width={20}
                  height={20}
                  className="size-5 rounded-md border border-black/50"
                />
              ) : null;
            })}
          </div>
        )}
      </div>
      <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-tight">
        {title}
        {year && <span className="text-muted"> · {year}</span>}
      </p>
      {rating != null ? (
        <span className="text-[11px] font-semibold text-accent-soft">
          ★ {rating.toLocaleString("it-IT", { maximumFractionDigits: 1 })}
          {affinity != null && (
            <span className="text-muted"> · per te {Math.round(affinity)}%</span>
          )}
        </span>
      ) : rating === null && showNoRating ? (
        <span className="text-[11px] font-semibold text-muted">Senza voto</span>
      ) : null}
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}

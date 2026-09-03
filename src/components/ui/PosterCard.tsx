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
  providers = [],
  href,
  className = "",
}: {
  title: string;
  posterPath: string | null;
  year?: string | null;
  providers?: PosterCardProvider[];
  href?: string;
  className?: string;
}) {
  const src = posterUrl(posterPath, "w342");

  const card = (
    <div className={`group ${className}`}>
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface">
        {src ? (
          <Image
            src={src}
            alt={title}
            fill
            sizes="(max-width: 480px) 33vw, 160px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">
            {title}
          </div>
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
                  className="rounded-md border border-black/40"
                />
              ) : null;
            })}
          </div>
        )}
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-tight">
        {title}
        {year && <span className="text-muted"> · {year}</span>}
      </p>
    </div>
  );

  if (href) {
    return <Link href={href}>{card}</Link>;
  }
  return card;
}

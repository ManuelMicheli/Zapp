import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BackButton } from "@/components/layout/BackButton";
import { backdropUrl, posterUrl } from "@/lib/config";

/**
 * Testata di `/cinema?film=`: al posto della riga col solo nome, il fondale del film a
 * tutta larghezza col titolo sopra, nella stessa forma dei banner del film altrove —
 * 16:9 su telefono e tablet, 21:9 da `lg`, dove un 16:9 largo tutta la pagina si
 * mangerebbe mezzo schermo. Indietro e briciola "Cinema" restano in alto a sinistra
 * (le due icone di `TopNav` occupano l'angolo destro), `action` è la pillola della
 * posizione, in basso accanto al titolo.
 *
 * Il fondale è `original` e `unoptimized` come la banda della scheda titolo: nessun
 * `srcset` che scenda a w1280 su un telefono ad alto DPR.
 */
export function FilmBanner({
  title,
  backdropPath,
  posterPath,
  action,
}: {
  title: string;
  backdropPath: string | null;
  posterPath: string | null;
  action?: ReactNode;
}) {
  const bg = backdropUrl(backdropPath, "original") ?? posterUrl(posterPath, "original");
  return (
    <header className="relative aspect-video w-full overflow-hidden lg:aspect-[21/9]">
      {bg ? (
        <Image
          src={bg}
          alt=""
          fill
          unoptimized
          priority
          className="object-cover object-[50%_30%]"
        />
      ) : (
        <div className="absolute inset-0 bg-surface" />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.55)_0%,rgba(0,0,0,0)_38%,rgba(0,0,0,0.35)_64%,rgba(0,0,0,0.94)_100%)]"
      />
      <div className="absolute left-5 top-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] z-10 flex items-center gap-3 lg:left-10">
        <BackButton inline />
        <Link
          data-crumb
          href="/cinema"
          className="text-[13px] font-medium text-accent-soft"
        >
          Cinema
        </Link>
      </div>
      <div className="absolute inset-x-5 bottom-4 z-10 flex flex-wrap items-end justify-between gap-x-3 gap-y-2 lg:inset-x-10 lg:bottom-6">
        <h1 className="line-clamp-2 min-w-0 text-[34px] font-bold leading-[1.03] tracking-[-0.045em] lg:text-[44px]">
          {title}
        </h1>
        {action}
      </div>
    </header>
  );
}

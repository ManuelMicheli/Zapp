import Image from "next/image";
import Link from "next/link";
import {
  copertinaUrl,
  durataLabel,
  linguaLabel,
  visualizzazioniLabel,
  type ShortFilm,
} from "@/lib/shorts/shape";

/**
 * La card di apertura di `/corti`: il corto in cima al catalogo, grande, con la trama
 * in chiaro. Serve a dire in un colpo solo che cosa e' questa sezione — un film da
 * guardare adesso, non una scheda da consultare.
 *
 * La copertina e' `priority`: e' l'immagine piu' grande della pagina e quasi sempre
 * l'LCP. `unoptimized` come tutte le miniature YouTube: `i.ytimg.com` serve due
 * taglie fisse, non un CDN a larghezze (vedi `copertinaUrl`).
 */
export function ShortFeatured({
  corto,
  visto = false,
  className = "",
}: {
  corto: ShortFilm;
  visto?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={`/corti/${corto.slug}`}
      className={`group relative isolate block overflow-hidden rounded-[24px] border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${className}`}
    >
      <div className="relative aspect-video md:aspect-[21/9]">
        <Image
          src={copertinaUrl(corto)}
          alt=""
          fill
          unoptimized
          priority
          className="object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.04]"
        />
        <span className="glass absolute bottom-3 right-3 flex size-[46px] items-center justify-center rounded-full md:hidden">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M8 5.5v13l11-6.5-11-6.5Z" />
          </svg>
        </span>
        {/* I veli servono solo dove il testo sta **sopra** l'immagine, cioè da md:
            sul telefono il testo sta sotto, e scurire la copertina per niente
            vorrebbe dire mostrare un fotogramma spento. */}
        <div className="absolute inset-0 hidden bg-gradient-to-t from-black via-black/55 to-black/10 md:block" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-black/85 via-black/25 to-transparent md:block" />
      </div>

      {/* Sul telefono il testo sta **sotto** la copertina: sovrapposto, a 390px, il
          titolo grande e tre righe di trama coprivano tutta l'immagine e non si
          leggeva bene né l'uno né l'altra. Da md torna dentro, dove c'è spazio. */}
      <div className="p-5 md:absolute md:inset-x-0 md:bottom-0 md:max-w-[62%] md:p-8 lg:p-10">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <span className="glass-accent rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-white">
            Il più visto
          </span>
          {visto && (
            <span className="glass rounded-full px-3 py-1 text-[11px] font-semibold text-accent-pale">
              Già visto
            </span>
          )}
        </div>
        <h2 className="text-balance text-[26px] font-bold leading-[1.05] tracking-[-0.04em] md:text-[38px] lg:text-[46px]">
          {corto.titolo}
        </h2>
        <p className="mt-2 line-clamp-3 max-w-[52ch] text-pretty text-[14px] leading-relaxed text-white/75 md:mt-3 md:text-[16px]">
          {corto.trama}
        </p>
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-medium text-muted md:text-white/60 md:text-[13px]">
          <span>{corto.genere}</span>
          <span aria-hidden="true">·</span>
          <span>{durataLabel(corto.durata)}</span>
          <span aria-hidden="true">·</span>
          <span>{linguaLabel(corto)}</span>
          <span aria-hidden="true">·</span>
          <span>{visualizzazioniLabel(corto.visualizzazioni)} visualizzazioni</span>
        </p>
      </div>
    </Link>
  );
}

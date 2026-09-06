import Link from "next/link";
import { getViewerLocation } from "@/lib/cinema/queries";
import { isCinemaEnabled } from "@/lib/cinema/source";
import { Icon } from "./icons";

/**
 * Ingresso evidente alla sezione cinema (home e Scopri): una card che apre `/cinema`.
 * Legge solo la posizione salvata, nessuna chiamata a MyMovies: costa una query.
 */
export async function CinemaEntry({ className = "" }: { className?: string }) {
  if (!isCinemaEnabled()) return null;
  const location = await getViewerLocation();
  const subtitle = location
    ? `Programmazione di oggi vicino a ${location.label}`
    : "Dimmi dove sei: sale, orari e biglietti di oggi";

  return (
    <section className={`px-5 lg:px-10 ${className}`}>
      <Link
        href="/cinema"
        className="glass flex items-center gap-4 rounded-[20px] p-4 transition-colors hover:bg-white/[0.12]"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-[var(--shadow-accent)]">
          <Icon name="ticket" size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-bold tracking-[-0.02em]">
            Al cinema oggi
          </span>
          <span className="block truncate text-[13px] text-muted">{subtitle}</span>
        </span>
        <span className="shrink-0 text-[15px] font-semibold text-accent-soft">
          Apri →
        </span>
      </Link>
    </section>
  );
}

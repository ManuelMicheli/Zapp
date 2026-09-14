import Image from "next/image";
import Link from "next/link";
import { HorizontalShelf } from "@/components/discover/HorizontalShelf";
import { profileUrl } from "@/lib/config";
import type { PersonaPreferita } from "@/lib/people/queries";

/**
 * I preferiti come cerchi in fila. Nome e foto arrivano dalla riga di
 * `favorite_people`: nessuna chiamata TMDB per disegnare lo scaffale.
 */
export function FavoritePeopleShelf({
  persone,
  titolo = "Attori e registi preferiti",
}: {
  persone: PersonaPreferita[];
  titolo?: string;
}) {
  if (persone.length === 0) return null;
  return (
    <HorizontalShelf title={titolo}>
      {persone.map((p) => (
        <Link
          key={p.personId}
          href={`/person/${p.personId}`}
          className="flex w-20 shrink-0 flex-col items-center gap-2 text-center md:w-24"
        >
          <div className="relative size-[72px] overflow-hidden rounded-full border border-white/[0.08] bg-surface-2 md:size-20">
            {p.profilePath ? (
              <Image
                src={profileUrl(p.profilePath)!}
                alt={p.name}
                fill
                sizes="80px"
                className="object-cover object-[50%_20%]"
              />
            ) : (
              <span className="flex h-full items-center justify-center text-xl text-muted">
                {p.name.charAt(0)}
              </span>
            )}
          </div>
          <span className="line-clamp-2 text-xs font-medium">{p.name}</span>
        </Link>
      ))}
    </HorizontalShelf>
  );
}

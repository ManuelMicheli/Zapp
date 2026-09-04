import Image from "next/image";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import type { TmdbCastMember } from "@/lib/tmdb/types";

export function CastRow({ cast }: { cast: TmdbCastMember[] }) {
  const main = cast.slice(0, 12);
  if (main.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-5 text-xl font-bold tracking-[-0.03em] md:px-0">Cast</h2>
      <div className="scrollbar-none flex gap-2.5 overflow-x-auto px-5 pb-1 md:px-0">
        {main.map((member) => (
          <div
            key={member.id}
            className="flex w-[84px] shrink-0 flex-col items-center gap-2 text-center"
          >
            <div className="relative size-[72px] overflow-hidden rounded-full border border-white/[0.08] bg-surface-2">
              {member.profile_path ? (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w185${member.profile_path}`}
                  alt={member.name}
                  fill
                  sizes="72px"
                  className="object-cover object-[50%_20%]"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-lg text-muted">
                  {member.name.charAt(0)}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="line-clamp-2 text-xs font-semibold leading-tight">
                {member.name}
              </p>
              {member.character && (
                <p className="line-clamp-1 text-[11px] leading-tight text-muted">
                  {member.character}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

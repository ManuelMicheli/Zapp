import Image from "next/image";
import { TMDB_IMAGE_BASE } from "@/lib/config";
import type { TmdbCastMember } from "@/lib/tmdb/types";

export function CastRow({ cast }: { cast: TmdbCastMember[] }) {
  const main = cast.slice(0, 10);
  if (main.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 px-4 text-base font-bold">Cast</h2>
      <div className="scrollbar-none flex gap-3 overflow-x-auto px-4 pb-1">
        {main.map((member) => (
          <div key={member.id} className="w-20 shrink-0">
            <div className="relative aspect-square w-20 overflow-hidden rounded-full bg-surface">
              {member.profile_path ? (
                <Image
                  src={`${TMDB_IMAGE_BASE}/w185${member.profile_path}`}
                  alt={member.name}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-lg text-muted">
                  {member.name.charAt(0)}
                </div>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-center text-xs font-medium leading-tight">
              {member.name}
            </p>
            {member.character && (
              <p className="line-clamp-1 text-center text-[10px] text-muted">
                {member.character}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

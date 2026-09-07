import Image from "next/image";
import { backdropUrl } from "@/lib/config";
import type { Tables } from "@/types/database";
import { fotogrammi, type TitleRaw } from "@/lib/tmdb/facts";

/**
 * Fotogrammi del titolo (`append_to_response=images`, senza quello già usato come
 * fondale della banda). Scaffale orizzontale: il trailer resta il fondale, qui si
 * guardano le immagini.
 */
export function Gallery({ title }: { title: Tables<"titles"> }) {
  const stills = fotogrammi(title.raw as unknown as TitleRaw, title.backdrop_path, 8);
  if (stills.length < 2) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-5 md:px-0">
        <h2 className="text-xl font-bold tracking-[-0.03em]">Immagini</h2>
        <span className="text-xs text-muted-2">{stills.length} fotogrammi</span>
      </div>
      <div className="scrollbar-none flex gap-2.5 overflow-x-auto px-5 pb-1 md:px-0">
        {stills.map((path) => (
          <div
            key={path}
            className="relative aspect-video w-[232px] shrink-0 overflow-hidden rounded-[14px] border border-border bg-surface-2 lg:w-[300px]"
          >
            <Image
              src={backdropUrl(path, "original")!}
              alt=""
              fill
              sizes="(min-width: 1024px) 300px, 232px"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

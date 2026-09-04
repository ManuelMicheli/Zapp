import { genreColor } from "@/lib/genre-colors";

interface Props {
  items: { name: string; count: number }[];
  /** Somma dei conteggi mostrati: denominatore delle percentuali. */
  total: number;
}

/**
 * "DNA" dei generi: barra unica a segmenti proporzionali + legenda con
 * pallino colorato, nome e percentuale. Colori da GENRE_COLORS.
 */
export function GenreBar({ items, total }: Props) {
  const sum = total > 0 ? total : items.reduce((acc, i) => acc + i.count, 0);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-[7px]">
        {items.map((i) => (
          <div
            key={i.name}
            style={{ flexGrow: i.count, flexBasis: 0, background: genreColor(i.name) }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-2">
        {items.map((i) => (
          <li key={i.name} className="flex items-center gap-1.5 text-[13px]">
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ background: genreColor(i.name) }}
            />
            <span>{i.name}</span>
            <span className="text-muted">
              {sum > 0 ? Math.round((i.count / sum) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

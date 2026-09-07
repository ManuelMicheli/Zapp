import { genreColor } from "@/lib/genre-colors";

interface Props {
  items: { name: string; count: number }[];
  /** Somma dei conteggi mostrati: denominatore delle percentuali. */
  total: number;
}

/**
 * "DNA" dei generi: filo unico a segmenti proporzionali + legenda con
 * pallino colorato, nome e percentuale. Colori da GENRE_COLORS. Sottile e
 * senza scatola: sta accanto alle statistiche tipografiche.
 */
export function GenreBar({ items, total }: Props) {
  const sum = total > 0 ? total : items.reduce((acc, i) => acc + i.count, 0);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
        {items.map((i) => (
          <div
            key={i.name}
            style={{ flexGrow: i.count, flexBasis: 0, background: genreColor(i.name) }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2.5">
        {items.map((i) => (
          <li key={i.name} className="flex items-center gap-2 text-[13px]">
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: genreColor(i.name) }}
            />
            <span>{i.name}</span>
            <span className="tabular-nums text-muted-2">
              {sum > 0 ? Math.round((i.count / sum) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

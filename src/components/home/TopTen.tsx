import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";
import { getTrending } from "@/lib/tmdb/client";
import { searchResultTitle } from "@/lib/tmdb/mappers";
import type { TmdbMultiResult } from "@/lib/tmdb/types";
import { HomeTypeGate, type HomeTab } from "./HomeType";

/** Quanti titoli: è una top 10, non uno scaffale. */
const SIZE = 10;

/** Larghezza della copertina: più grande di uno scaffale normale, il numero le sta accanto. */
const POSTER_CLASS = "w-[116px] lg:w-[160px]";
/** Il riquadro del numero è alto quanto la copertina (2:3 della larghezza sopra). */
const NUMBER_BOX = "h-[174px] lg:h-[240px]";
/**
 * Corpo scelto perché la cifra sia alta quanto la copertina (l'altezza di un numero
 * è ~0,72em), come nella classifica Netflix; la copertina la scavalca e ne copre la
 * parte destra.
 */
const NUMBER_TEXT = "text-[242px] lg:text-[333px]";
/** Quanto la copertina sale sopra la cifra. */
const OVERLAP = "-ml-8 lg:-ml-11";

/**
 * Numero della classifica alla maniera Netflix: cifra enorme, riempita appena e
 * contornata, con la copertina che le sale sopra e ne copre la parte destra.
 */
function Rank({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className={`${NUMBER_BOX} ${NUMBER_TEXT} flex translate-y-[0.045em] select-none items-end font-black leading-[0.72] tracking-[-0.08em] text-white/[0.07]`}
      style={{ WebkitTextStroke: "3px rgba(255,255,255,0.42)" }}
    >
      {n}
    </span>
  );
}

function TopTenCard({ item, rank }: { item: TmdbMultiResult; rank: number }) {
  const title = searchResultTitle(item);
  const href = `/title/${item.media_type}/${item.id}`;
  const src = posterUrl(item.poster_path ?? null, "w342");
  return (
    <Link
      href={href}
      className="flex shrink-0 items-end"
      aria-label={`${rank}. ${title}`}
    >
      <Rank n={rank} />
      <div
        data-preview={href}
        className={`cv-auto relative z-10 ${OVERLAP} ${POSTER_CLASS} shrink-0`}
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[14px] border border-white/[0.08] bg-surface-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
          {src ? (
            <Image
              src={src}
              alt={title}
              fill
              sizes="(max-width: 480px) 40vw, 180px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">
              {title}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function TopTenShelf({ items, type }: { items: TmdbMultiResult[]; type: HomeTab }) {
  const mine = (
    type === "all" ? items : items.filter((r) => r.media_type === type)
  ).slice(0, SIZE);
  if (mine.length === 0) return null;
  const label =
    type === "movie"
      ? "I 10 film più visti questa settimana"
      : type === "tv"
        ? "Le 10 serie più viste questa settimana"
        : "I 10 titoli più visti questa settimana";
  return (
    <HomeTypeGate type={type}>
      <section>
        <div className="mb-3 px-5 lg:px-10">
          <h2 className="text-xl font-bold tracking-[-0.03em]">Top 10 della settimana</h2>
          <p className="mt-0.5 text-[13px] text-muted">{label}</p>
        </div>
        <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 lg:gap-4 lg:px-10">
          {mine.map((item, i) => (
            <TopTenCard key={`${item.media_type}-${item.id}`} item={item} rank={i + 1} />
          ))}
        </div>
      </section>
    </HomeTypeGate>
  );
}

/**
 * Classifica settimanale in home, come la top 10 di Netflix: numero grande accanto
 * alla copertina. I dati sono le tendenze della settimana di TMDB (`trending/all/week`,
 * due pagine: la prima è la stessa `fetch` degli scaffali Scopri e del muro, quindi
 * cache Next 1h condivisa e nessuna chiamata in più). Le tre varianti — mista, film e
 * serie — sono rese insieme dal server e `HomeTypeGate` mostra quella della scheda
 * attiva, come per il resto della home.
 */
export async function TopTen() {
  const [first, second] = await Promise.all([
    getTrending().catch(() => null),
    getTrending(2).catch(() => null),
  ]);
  const items = [...(first?.results ?? []), ...(second?.results ?? [])].filter(
    (r) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path,
  );
  if (items.length === 0) return null;
  return (
    <>
      <TopTenShelf items={items} type="all" />
      <TopTenShelf items={items} type="movie" />
      <TopTenShelf items={items} type="tv" />
    </>
  );
}

/** Stessa geometria della fila vera, così il salto non si vede. */
export function TopTenSkeleton() {
  return (
    <section>
      <div className="mb-3 px-5 lg:px-10">
        <div className="h-6 w-52 rounded-full bg-white/[0.08]" />
        <div className="mt-1.5 h-3.5 w-64 rounded-full bg-white/[0.05]" />
      </div>
      <div className="flex gap-3 overflow-hidden px-5 pb-1 lg:gap-4 lg:px-10">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex shrink-0 items-end">
            <div className={`${NUMBER_BOX} w-24 lg:w-32`} />
            <div className={`${POSTER_CLASS} ${OVERLAP} shrink-0`}>
              <div className="aspect-[2/3] w-full rounded-[14px] bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

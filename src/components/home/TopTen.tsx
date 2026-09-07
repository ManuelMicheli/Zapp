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
const POSTER_CLASS = "w-[116px] md:w-[148px] lg:w-[180px] xl:w-[200px]";
/**
 * Altezza del riquadro della cifra. La copertina è 2:3 della larghezza qui sopra
 * (174 / 240 px) e la cifra le è alta uguale; il riquadro è più alto di `HEAD_ROOM`
 * unità (× 174/72 e × 240/72) perché sopra la cifra ci sta il mezzo contorno e
 * l'overshoot delle cifre tonde — lo scaffale è `overflow-x-auto`, quindi taglia in
 * verticale quel che sborda.
 */
const NUMBER_BOX = "h-[188px] md:h-[240px] lg:h-[292px] xl:h-[325px]";
/** Quanto la copertina sale sopra la cifra. */
const OVERLAP = "-ml-8 md:-ml-10 lg:-ml-[50px] xl:-ml-14";

/**
 * Riquadro della cifra in unità del viewBox (alto 72 = altezza delle cifre, che in
 * Inter Black avanzano ~0,64em). Larghezza fissa per numero di cifre: la geometria
 * della card è la stessa sul server e nel browser, quindi la riga non si muove.
 */
const DIGIT_W = 64;
const DIGIT_W_2 = 120;
/** Respiro sopra la cifra, in unità del viewBox (la base resta sul fondo). */
const HEAD_ROOM = 6;
/** Le due cifre del 10 quasi si toccano, come nella classifica Netflix. */
const KERNING = -8;
/** Contorno della cifra, in unità del viewBox (≈ 4 px a 174, ≈ 5,5 px a 240). */
const STROKE = 1.65;

/**
 * Numero della classifica alla maniera Netflix: cifra enorme, **solo contornata**
 * (nessun riempimento: si vede il fondo della pagina), alta quanto la copertina, che
 * le sale sopra e ne copre la parte destra. È un SVG e non testo: il contorno resta
 * uniforme a ogni misura e la larghezza del riquadro è fissa, mentre
 * `-webkit-text-stroke` la faceva dipendere dalle metriche del font.
 * La cifra è **allineata a destra** e non stirata: l'1 resta stretto e attaccato alla
 * copertina come da Netflix, invece di essere allargato quanto un 2.
 */
function Rank({ n }: { n: number }) {
  const w = n >= 10 ? DIGIT_W_2 : DIGIT_W;
  return (
    <svg
      aria-hidden
      viewBox={`0 ${-HEAD_ROOM} ${w} ${72 + HEAD_ROOM}`}
      preserveAspectRatio="xMaxYMax meet"
      className={`${NUMBER_BOX} block w-auto shrink-0 select-none overflow-visible`}
    >
      <text
        x={w}
        y="72"
        textAnchor="end"
        fontSize="100"
        fontWeight="900"
        letterSpacing={n >= 10 ? KERNING : 0}
        fill="none"
        stroke="rgba(255,255,255,0.46)"
        strokeWidth={STROKE}
        strokeLinejoin="round"
      >
        {n}
      </text>
    </svg>
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
      {/*
        Niente `.cv-auto` qui: la sua misura intrinseca (112×200) non è quella di
        queste copertine, e con la riga allineata in basso le card cambiavano
        altezza entrando e uscendo dallo schermo — i numeri "fluttuavano" mentre
        si scorreva. Sono dieci copertine, non uno scaffale infinito.
      */}
      <div
        data-preview={href}
        className={`relative z-10 ${OVERLAP} ${POSTER_CLASS} shrink-0`}
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[14px] border border-white/[0.08] bg-surface-2 shadow-[0_18px_40px_rgba(0,0,0,0.55)]">
          {src ? (
            <Image
              src={src}
              alt={title}
              fill
              sizes="(max-width: 480px) 40vw, (max-width: 1023px) 148px, (max-width: 1279px) 180px, 200px"
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
        <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:gap-4 lg:gap-5 lg:px-10">
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
            <div className={`${NUMBER_BOX} w-[155px] shrink-0 lg:w-[213px]`} />
            <div className={`${POSTER_CLASS} ${OVERLAP} shrink-0`}>
              <div className="aspect-[2/3] w-full rounded-[14px] bg-white/[0.06]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

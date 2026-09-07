import Image from "next/image";
import Link from "next/link";
import { posterUrl } from "@/lib/config";
import { getProviderChart, type ChartItem } from "@/lib/charts/queries";
import { HomeTypeGate } from "./HomeType";
import { TopTenPair } from "./TopTenPair";

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

/**
 * `rank` è la posizione **vera** pubblicata da Netflix (`item.rank`), non l'indice
 * nella lista: due liste diverse (film, serie) possono avere entrambe un "#1".
 */
function TopTenCard({ item }: { item: ChartItem }) {
  const href = `/title/${item.mediaType}/${item.id}`;
  const src = posterUrl(item.posterPath, "w342");
  return (
    <Link
      href={href}
      className="flex shrink-0 items-end"
      aria-label={`${item.rank}. ${item.title}`}
    >
      <Rank n={item.rank} />
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
              alt={item.title}
              fill
              sizes="(max-width: 480px) 40vw, (max-width: 1023px) 148px, (max-width: 1279px) 180px, 200px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted">
              {item.title}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Solo la fila di copertine, senza intestazione: la riusano `TopTenRow` e `TopTenPair`. */
function TopTenCards({ items }: { items: ChartItem[] }) {
  return (
    <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:gap-4 lg:gap-5 lg:px-10">
      {items.map((item) => (
        <TopTenCard key={`${item.mediaType}-${item.id}`} item={item} />
      ))}
    </div>
  );
}

/**
 * Intestazione + fila numerata 1-10 per le schede "Film" e "Serie TV", dove il tipo
 * è già scelto in testata: qui l'intestazione nomina il tipo e non ci sono pillole.
 */
function TopTenRow({
  items,
  heading,
  subheading,
}: {
  items: ChartItem[];
  heading: string;
  subheading: string;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-3 px-5 lg:px-10">
        <h2 className="text-xl font-bold tracking-[-0.03em]">{heading}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{subheading}</p>
      </div>
      <TopTenCards items={items} />
    </section>
  );
}

const MOVIE_HEADING = "Top 10 film su Netflix in Italia";
const TV_HEADING = "Top 10 serie su Netflix in Italia";
/** Intestazione della scheda "Tutto": il tipo lo dicono le pillole, non il titolo. */
const ALL_HEADING = "Top 10 su Netflix in Italia";
/**
 * Distingue queste file dagli scaffali "I più visti su ..." di Scopri (`ChartShelf`),
 * che sono una nostra ricostruzione da JustWatch: qui il numero è quello che Netflix
 * pubblica davvero, non una stima.
 */
const SUBHEADING = "Classifica ufficiale, non una nostra stima";

/**
 * Classifica in home come la Top 10 di Netflix: numero grande accanto alla
 * copertina. I dati sono la Top 10 **ufficiale** che Netflix pubblica ogni
 * settimana per l'Italia (`getProviderChart(8)`, tabella `title_charts`, fonte
 * `netflix_tudum`), non le tendenze TMDB: per questo il numero mostrato è
 * `item.rank`, la posizione vera pubblicata da Netflix, e mai l'indice nella lista.
 *
 * Netflix pubblica **due** classifiche separate, film e serie, ciascuna numerata
 * da 1 a 10: mescolarle in un'unica fila inventerebbe un ordinamento che Netflix
 * non ha mai pubblicato (e due "#1" nella stessa fila sarebbero anche peggio).
 * Restano quindi **due liste distinte anche nella scheda "Tutto"**: cambia solo il
 * modo in cui si passa dall'una all'altra. Nelle schede "Film" e "Serie TV" il tipo
 * è già scelto in testata (`HomeTypeGate`) e si vede la sola `TopTenRow`
 * corrispondente, con la propria intestazione. Nella scheda "Tutto" invece le due
 * file **non sono più impilate**: `TopTenPair` (client) riceve entrambe le file
 * già renderizzate dal server come JSX pronto (nessun dato passa al client, nessuna
 * rifetch) e tiene solo lo stato locale di quale mostrare, con due pillole
 * "Film"/"Serie" nell'intestazione della sezione — lo stesso schema di
 * `HomeTypeGate`/`HomeTypeSwap` usato nel resto della home. Se manca una delle due
 * liste — o entrambe, quando i job che scaricano la classifica non hanno ancora
 * girato in un ambiente — `TopTenPair` non mostra la pillola corrispondente (con
 * una sola lista disponibile le pillole spariscono del tutto: non ha senso un
 * selettore con una voce sola) e, se non resta nulla, il componente intero torna
 * `null` prima ancora di renderizzare.
 */
export async function TopTen() {
  // 8 = Netflix (id provider TMDB, vedi PROVIDERS in src/lib/config.ts).
  const chart = await getProviderChart(8).catch(() => []);
  const movies = chart
    .filter((item) => item.mediaType === "movie")
    .sort((a, b) => a.rank - b.rank)
    .slice(0, SIZE);
  const tv = chart
    .filter((item) => item.mediaType === "tv")
    .sort((a, b) => a.rank - b.rank)
    .slice(0, SIZE);
  if (movies.length === 0 && tv.length === 0) return null;
  return (
    <>
      <HomeTypeGate type="all">
        <TopTenPair
          heading={ALL_HEADING}
          subheading={SUBHEADING}
          film={movies.length > 0 ? <TopTenCards items={movies} /> : null}
          serie={tv.length > 0 ? <TopTenCards items={tv} /> : null}
        />
      </HomeTypeGate>
      <HomeTypeGate type="movie">
        <TopTenRow items={movies} heading={MOVIE_HEADING} subheading={SUBHEADING} />
      </HomeTypeGate>
      <HomeTypeGate type="tv">
        <TopTenRow items={tv} heading={TV_HEADING} subheading={SUBHEADING} />
      </HomeTypeGate>
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

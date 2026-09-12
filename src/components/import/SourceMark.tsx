import type { SourceSlug } from "@/lib/import/sources/registry";

/**
 * I marchi delle piattaforme da cui si importa, in SVG **dentro la pagina**.
 *
 * Non `<img>` e non `next/image`: sono quattro disegni di poche righe, e in linea
 * non costano una richiesta, non passano dall'ottimizzatore di Vercel (che su
 * Hobby ha una quota, vedi il loader di `src/lib/image-loader.ts`) e non
 * chiedono nulla alla CSP, che fuori da `self` non fa passare immagini.
 *
 * I tracciati vengono da simple-icons (CC0). Uso nominativo: servono a
 * riconoscere la piattaforma da cui si porta dentro la propria cronologia.
 */

/** Colori dei marchi, come li usano le piattaforme. */
const NETFLIX = "#E50914";
const TVTIME_FONDO = "#545454";
const LETTERBOXD = ["#FF8000", "#00E054", "#40BCF4"] as const;

function Netflix() {
  return (
    <path
      fill={NETFLIX}
      d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24zm8.489 0v9.63L18.6 22.951c-.043-7.86-.004-15.913.002-22.95zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22z"
    />
  );
}

/**
 * I tre pallini: arancio, verde, azzurro, che si sovrappongono. Nel marchio vero
 * le sovrapposizioni schiariscono, quindi `screen` — lo stesso effetto, senza
 * dover disegnare a mano le sei lenti intermedie.
 */
function Letterboxd() {
  return (
    <g style={{ mixBlendMode: "screen" }}>
      {[5, 12, 19].map((cx, i) => (
        <circle key={cx} cx={cx} cy={12} r={5} fill={LETTERBOXD[i]} />
      ))}
    </g>
  );
}

/**
 * La T a blocchi su quadrato grigio, con le cinque tessere di giallo leggermente
 * diverse fra loro: è il marchio come lo serve tvtime.com (favicon del sito,
 * letta il 2026-09-12), non l'adattamento a un colore solo.
 */
const TVTIME_BLOCCHI: [number, number, string][] = [
  [4.8, 4.8, "#FDEB69"],
  [9.6, 4.8, "#FCE45E"],
  [14.4, 4.8, "#F3D457"],
  [9.6, 9.6, "#F9D457"],
  [9.6, 14.4, "#EFBE4E"],
];

function TvTime() {
  return (
    <>
      <rect width={24} height={24} rx={3.84} fill={TVTIME_FONDO} />
      {TVTIME_BLOCCHI.map(([x, y, fill]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={4.8} height={4.8} fill={fill} />
      ))}
    </>
  );
}

/** Non è una piattaforma: due graffe, il segno di un file che scrivi tu. */
function FileMark() {
  return (
    <path
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.5 3.5c-2.2 0-3 1-3 2.8v2.9c0 1.5-1 2.6-2.5 2.8 1.5.2 2.5 1.3 2.5 2.8v2.9c0 1.8.8 2.8 3 2.8M14.5 3.5c2.2 0 3 1 3 2.8v2.9c0 1.5 1 2.6 2.5 2.8-1.5.2-2.5 1.3-2.5 2.8v2.9c0 1.8-.8 2.8-3 2.8"
    />
  );
}

const MARCHI: Record<SourceSlug, () => React.ReactElement> = {
  netflix: Netflix,
  letterboxd: Letterboxd,
  tvtime: TvTime,
  file: FileMark,
};

/**
 * Il marchio dentro la sua tessera scura, uguale per tutte e quattro: il colore
 * lo mette il logo, non il fondo (scelta utente 2026-09-12).
 *
 * `size` è il lato della tessera; il marchio ci sta dentro al 62%, tranne TV
 * Time che *è* un quadrato pieno e si ferma al 58%: a parità di misura un
 * quadrato pesa più di un glifo e sembrerebbe più grande degli altri.
 */
export function SourceMark({
  slug,
  size = 44,
  className = "",
}: {
  slug: SourceSlug;
  size?: number;
  className?: string;
}) {
  const Marchio = MARCHI[slug];
  const lato = Math.round(size * (slug === "tvtime" ? 0.58 : 0.62));

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-[13px] border border-white/10 bg-white/[0.06] text-accent-pale ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={lato}
        height={lato}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <Marchio />
      </svg>
    </span>
  );
}

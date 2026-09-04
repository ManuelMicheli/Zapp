import type { CSSProperties } from "react";
import { posterUrl } from "@/lib/config";

interface Props {
  posters: string[];
  /** altezza del riquadro in px */
  height?: number;
  /** larghezza del riquadro in px (default mobile) */
  width?: number;
  /** numero di colonne (default mobile) */
  columns?: number;
  blur?: number;
  opacity?: number;
  speed?: "normal" | "slow";
  className?: string;
}

const DURATIONS = { normal: [46, 58, 52, 64], slow: [90, 104, 96, 110] } as const;
const OFFSETS = [0, -300, -60, -340, -180, -40, -260, -120];

/** altezza + gap di una locandina */
const ITEM = 168 + 12;
/** altezza di un "set" di 4 locandine: quanto trasla l'animazione */
const SET = ITEM * 4;

/**
 * Muro di locandine in prospettiva, N colonne che scorrono in loop infinito.
 * Passo 5 fra le colonne: con 16 locandine le colonne non si ripetono identiche.
 * Ogni colonna ripete `n` volte le sue 4 locandine e trasla di esattamente un set
 * (`--wall-shift` = 100/n%): il loop è senza buchi per qualunque `height`.
 */
export function PosterWall({
  posters,
  height = 640,
  width = 540,
  columns = 4,
  blur = 0,
  opacity = 1,
  speed = "normal",
  className = "",
}: Props) {
  const durations = DURATIONS[speed];
  // ripetizioni necessarie perché la colonna copra il riquadro anche a metà traslazione
  const repeats = Math.max(3, Math.ceil((height + SET) / SET) + 1);
  const cols =
    posters.length === 0
      ? []
      : Array.from({ length: columns }, (_, c) =>
          [0, 1, 2, 3].map((j) => posters[(c * 5 + j) % posters.length]),
        );

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute -left-[70px] -top-[120px] overflow-hidden ${className}`}
      style={{
        height,
        width,
        perspective: 1000,
        filter: blur ? `blur(${blur}px)` : undefined,
        opacity,
      }}
    >
      <div
        className="flex gap-3"
        style={{
          transform: "rotateX(24deg) rotateZ(-8deg) translateY(-40px)",
          transformOrigin: "50% 0%",
        }}
      >
        {cols.map((col, c) => (
          <div
            key={c}
            className={`wall-col flex flex-col gap-3 pb-3 ${c % 2 ? "wall-down" : "wall-up"}`}
            style={
              {
                marginTop: OFFSETS[c % OFFSETS.length],
                animationDuration: `${durations[c % durations.length]}s`,
                "--wall-shift": `${100 / repeats}%`,
              } as CSSProperties
            }
          >
            {Array.from({ length: repeats }, () => col)
              .flat()
              .map((path, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${path}-${i}`}
                  src={posterUrl(path, "w185") ?? ""}
                  alt=""
                  width={112}
                  height={168}
                  loading={i < 4 ? "eager" : "lazy"}
                  decoding="async"
                  className="h-[168px] w-[112px] rounded-xl bg-surface-2 object-cover shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

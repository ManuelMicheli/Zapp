import { posterUrl } from "@/lib/config";

interface Props {
  posters: string[];
  /** altezza del riquadro in px */
  height?: number;
  blur?: number;
  opacity?: number;
  speed?: "normal" | "slow";
  className?: string;
}

const DURATIONS = { normal: [46, 58, 52, 64], slow: [90, 104, 96, 110] } as const;

/**
 * Muro di locandine in prospettiva, 4 colonne che scorrono in loop infinito.
 * Ogni colonna ripete 3 volte la sua lista e trasla di un terzo: nessun buco.
 */
export function PosterWall({
  posters,
  height = 640,
  blur = 0,
  opacity = 1,
  speed = "normal",
  className = "",
}: Props) {
  const cols = [0, 1, 2, 3].map((c) => posters.filter((_, i) => i % 4 === c).slice(0, 4));
  const offsets = [0, -300, -60, -340];
  const durations = DURATIONS[speed];
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute -left-[70px] -top-[120px] w-[540px] overflow-hidden ${className}`}
      style={{
        height,
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
            style={{ marginTop: offsets[c], animationDuration: `${durations[c]}s` }}
          >
            {[...col, ...col, ...col].map((path, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${path}-${i}`}
                src={posterUrl(path, "w185") ?? ""}
                alt=""
                width={112}
                height={168}
                loading={i < 4 ? "eager" : "lazy"}
                className="h-[168px] w-[112px] rounded-xl bg-surface-2 object-cover shadow-[0_10px_30px_rgba(0,0,0,0.55)]"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

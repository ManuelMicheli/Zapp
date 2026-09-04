import type { CSSProperties } from "react";
import { posterUrl } from "@/lib/config";

interface Props {
  posters: string[];
  /** altezza del riquadro in px */
  height?: number;
  /** larghezza del riquadro: px o valore CSS (es. "calc(100% + 140px)") */
  width?: number | string;
  /** numero di colonne (default mobile) */
  columns?: number;
  blur?: number;
  opacity?: number;
  speed?: "normal" | "slow";
  className?: string;
}

const DURATIONS = { normal: [46, 58, 52, 64], slow: [90, 104, 96, 110] } as const;
/** sfasamento verticale delle colonne: sempre entro una locandina, così non costa altezza */
const OFFSETS = [0, -120, -60, -160, -20, -100, -80, -140];

const POSTER_W = 112;
const POSTER_H = 168;
const GAP = 12;
/** altezza + gap di una locandina */
const ITEM = POSTER_H + GAP;
/** locandine diverse per colonna: un "set", quanto trasla l'animazione */
const PER_COL = 4;
const SET = ITEM * PER_COL;

/** prospettiva della scena (px) e rotazioni: devono coincidere con lo style del wrapper */
const PERSPECTIVE = 1000;
const TILT_DEG = 8;
const PITCH_DEG = 24;
const SIN_TILT = Math.sin((TILT_DEG * Math.PI) / 180);
const COS_TILT = Math.cos((TILT_DEG * Math.PI) / 180);
const SIN_PITCH = Math.sin((PITCH_DEG * Math.PI) / 180);
const COS_PITCH = Math.cos((PITCH_DEG * Math.PI) / 180);
/** oltre questa profondità (nel piano già inclinato) un punto finisce dietro la camera */
const CAMERA_PLANE = PERSPECTIVE / SIN_PITCH;

/**
 * Geometria del muro. Ordine delle trasformazioni sul wrapper (da destra a sinistra):
 * translateY(-lift) → rotateZ(-8°) → rotateX(24°) → prospettiva.
 * - `rotateZ` abbassa il bordo sinistro di `tilt` px e alza quello destro: `lift` lo
 *   compensa, così il bordo superiore delle colonne resta sopra il riquadro.
 * - `rotateX` con origine in alto porta il fondo verso la camera e lo ingrandisce:
 *   per coprire `height` px bastano `depth` px di layout, molto meno di `height`.
 * - Le colonne si fermano prima del piano camera: geometria dietro la camera è
 *   il caso in cui compositor (Chrome, Safari) clippano o fanno sparire le tile.
 */
function wallGeometry(height: number, columns: number) {
  const wrapperWidth = columns * POSTER_W + (columns - 1) * GAP;
  const tilt = (wrapperWidth / 2) * SIN_TILT;
  const lift = 40 + tilt;
  // profondità (dopo rotateZ) che, proiettata, arriva al fondo del riquadro
  const depth = height / (COS_PITCH + (height * SIN_PITCH) / PERSPECTIVE);
  // in coordinate di layout, sul bordo destro (quello alzato dal tilt)
  const reach = lift + (depth + tilt) / COS_TILT;
  // la colonna, anche sfasata di una locandina e traslata di un set, deve arrivare a `reach`:
  // granularità di una locandina (non di un set) per restare corti e davanti alla camera
  const items = Math.max(2 * PER_COL, Math.ceil((reach + ITEM + SET) / ITEM));
  const columnHeight = items * ITEM;
  // fondo della colonna a traslazione zero, sul bordo sinistro (quello abbassato dal tilt)
  const deepest = (columnHeight - lift) * COS_TILT + tilt;
  if (process.env.NODE_ENV !== "production" && deepest >= CAMERA_PLANE) {
    console.warn(
      `[PosterWall] colonne oltre il piano camera (${Math.round(deepest)} ≥ ${Math.round(CAMERA_PLANE)}): height=${height} columns=${columns}`,
    );
  }
  return { lift, items };
}

/**
 * Muro di locandine in prospettiva, N colonne che scorrono in loop infinito.
 * La colonna `c` usa le locandine `c*4 … c*4+3`: colonne adiacenti mai con titoli in
 * comune (con 40 locandine si ripetono solo a 10 colonne di distanza).
 * Ogni colonna è una sequenza periodica delle sue 4 locandine (`items` tile, quante ne
 * servono) e trasla di esattamente un set (`--wall-shift` = SET px): il loop è senza
 * buchi per qualunque `height`.
 * Le immagini sono tutte eager: le URL uniche sono poche (≤ 40) e una tile vuota che
 * aspetta il lazy-load si vede subito, perché il muro è sempre in movimento.
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
  const { lift, items } = wallGeometry(height, columns);
  const cols =
    posters.length === 0
      ? []
      : Array.from({ length: columns }, (_, c) =>
          Array.from(
            { length: PER_COL },
            (_, j) => posters[(c * PER_COL + j) % posters.length],
          ),
        );

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute -left-[70px] -top-[120px] overflow-hidden ${className}`}
      style={{
        height,
        width,
        perspective: PERSPECTIVE,
        filter: blur ? `blur(${blur}px)` : undefined,
        opacity,
      }}
    >
      <div
        className="flex gap-3"
        style={{
          transform: `rotateX(${PITCH_DEG}deg) rotateZ(-${TILT_DEG}deg) translateY(-${Math.round(lift)}px)`,
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
                "--wall-shift": `${SET}px`,
              } as CSSProperties
            }
          >
            {Array.from({ length: items }, (_, i) => col[i % PER_COL]).map((path, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${path}-${i}`}
                src={posterUrl(path, "w185") ?? ""}
                alt=""
                width={POSTER_W}
                height={POSTER_H}
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

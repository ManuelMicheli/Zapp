"use client";

import { useEffect, useState } from "react";
import type { LiveSession } from "@/lib/watch/live";
import { projectedPosition } from "@/lib/watch/progress";
import { usePlaybackClock } from "./WatchingProvider";

/** Stesso secondo per copertina personale, lista amici e profilo. */
export function usePlaybackPosition(viva: LiveSession | undefined): number | null {
  const clock = usePlaybackClock();
  const [tick, setTick] = useState<{ sample: typeof viva; position: number } | null>(
    null,
  );

  useEffect(() => {
    if (!viva || viva.state !== "playing") return;
    let frame = 0;
    let previousSecond = -1;
    function update() {
      if (!viva) return;
      const position = projectedPosition(viva, clock());
      const second = Math.floor(position / 1000);
      // Il frame individua il confine del secondo della misura, non del mount.
      // React aggiorna solo questa tessera e solo quando cambia il secondo.
      if (second !== previousSecond) {
        previousSecond = second;
        setTick({ sample: viva, position });
      }
      frame = requestAnimationFrame(update);
    }
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [viva, clock]);

  if (!viva) return null;
  return viva.state === "playing" && tick?.sample === viva
    ? tick.position
    : viva.positionMs;
}

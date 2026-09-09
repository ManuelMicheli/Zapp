"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * I coriandoli che annunciano il vincitore: una sola volta, alla prima apertura
 * del giorno. Canvas nudo, nessuna libreria (regola del progetto) e nessun nodo
 * per coriandolo: 90 rettangoli disegnati a mano costano un frame, 90 `div`
 * animati no.
 *
 * I colori sono quelli delle medaglie più il viola del marchio: esadecimali
 * grezzi come per `PROVIDER_BRAND`, perché sono colori di materiale (oro,
 * argento) e non ruoli del tema.
 */
const COLORS = ["#e6c15f", "#f6e6b4", "#d8dbe2", "#c5baf4", "#ffffff"];

const DURATION_MS = 3200;
/** Ultimo mezzo secondo: i coriandoli svaniscono invece di sparire di colpo. */
const FADE_MS = 900;

interface Flake {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vrot: number;
  color: string;
  /** Fase dell'oscillazione laterale: nessun coriandolo cade dritto. */
  phase: number;
}

export function Confetti({ onDone }: { onDone?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const fermo = useReducedMotion();

  useEffect(() => {
    if (fermo) {
      onDone?.();
      return;
    }
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = el.clientWidth;
    let h = el.clientHeight;
    const size = () => {
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();

    const count = w < 520 ? 70 : 110;
    const flakes: Flake[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      // partono sopra il bordo, sfalsati: la pioggia entra in scena, non appare
      y: -Math.random() * h * 0.9 - 20,
      vx: (Math.random() - 0.5) * 40,
      vy: 120 + Math.random() * 190,
      w: 4 + Math.random() * 5,
      h: 7 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      phase: Math.random() * Math.PI * 2,
    }));

    let raf = 0;
    let last = performance.now();
    const start = last;
    const onResize = () => size();
    window.addEventListener("resize", onResize);

    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const elapsed = now - start;
      const fade =
        elapsed > DURATION_MS - FADE_MS
          ? Math.max(0, (DURATION_MS - elapsed) / FADE_MS)
          : 1;

      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.phase += dt * 2.4;
        f.x += (f.vx + Math.sin(f.phase) * 26) * dt;
        f.y += f.vy * dt;
        f.rot += f.vrot * dt;
        if (f.y > h + 20) {
          f.y = -20;
          f.x = Math.random() * w;
        }
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.rot);
        ctx.globalAlpha = fade;
        ctx.fillStyle = f.color;
        // il coriandolo che ruota si assottiglia: un rettangolo pieno sembra un pixel
        ctx.fillRect(-f.w / 2, -f.h / 2, f.w, f.h * Math.abs(Math.cos(f.phase)));
        ctx.restore();
      }

      if (elapsed >= DURATION_MS) {
        ctx.clearRect(0, 0, w, h);
        onDone?.();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
    // `onDone` cambia a ogni render del genitore: la festa non si rilancia per quello
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fermo]);

  if (fermo) return null;
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 size-full"
    />
  );
}

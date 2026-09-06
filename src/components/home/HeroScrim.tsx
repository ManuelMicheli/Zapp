const HERO_GRADIENT =
  "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 25%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0.9) 82%, #000000 100%)";

const HERO_GLOW =
  "radial-gradient(circle, rgba(139,92,246,0.35) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%)";

/** Gradiente e alone viola sopra il muro di locandine della home vuota. */
export function HeroScrim() {
  return (
    <>
      <div className="absolute inset-0" style={{ background: HERO_GRADIENT }} />
      <div
        className="absolute -left-[120px] top-[200px] h-[260px] w-[420px] rounded-full blur-[40px]"
        style={{ background: HERO_GLOW }}
      />
    </>
  );
}

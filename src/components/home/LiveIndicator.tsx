/** Stesso segno su copertine personali, amici e profili. */
export function LiveIndicator({ state }: { state: "playing" | "paused" }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/70 px-2.5 py-1.5 text-[10px] font-bold leading-none text-white shadow-sm backdrop-blur-md"
      aria-label={state === "playing" ? "In riproduzione ora" : "In pausa"}
    >
      <span
        aria-hidden="true"
        className={`live-bars ${state === "playing" ? "live-bars-playing" : ""}`}
      >
        <i />
        <i />
        <i />
      </span>
      {state === "playing" ? "Ora" : "In pausa"}
    </span>
  );
}

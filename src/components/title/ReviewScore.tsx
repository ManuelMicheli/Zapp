/**
 * Il voto di una recensione, in **filigrana dentro la card**: cifra enorme e
 * sfumata sul fianco destro, con la stella accanto (richiesta utente
 * 2026-09-08). Prima era un "★ 9" da 14px in testata e si perdeva.
 *
 * Sta in un layer `-z-10`: la card che lo ospita è `relative isolate
 * overflow-hidden` e **tiene libera la colonna di destra** (`SCORE_GUTTER`), così
 * la filigrana non finisce sotto il testo — una cifra chiara dietro le parole
 * sembra un errore, non una decisione. Il 10, che è largo il doppio, scende di
 * un gradino di corpo per restare nella stessa colonna.
 *
 * Nessun hook: lo usano sia `ReviewsClient` (client) sia `TitleTrivia` (server).
 */

/**
 * Da mettere sulla card che ospita la filigrana: è la colonna che le lascia.
 * Il 10 occupa due cifre e ne chiede una più larga (senza, su desktop finiva
 * sotto le ultime parole della riga).
 */
export function scoreGutter(rating: number) {
  return rating >= 10 ? "pr-[104px] sm:pr-[148px]" : "pr-[84px] sm:pr-[116px]";
}

export function ReviewScore({ rating }: { rating: number }) {
  const wide = rating >= 10;

  return (
    <span
      aria-label={`Voto ${rating} su 10`}
      className="pointer-events-none absolute top-1/2 right-3 -z-10 flex -translate-y-1/2 items-center gap-1.5 leading-none select-none"
    >
      <span aria-hidden className="text-[20px] text-accent-soft/45 sm:text-[24px]">
        ★
      </span>
      <b
        aria-hidden
        className={`bg-gradient-to-b from-white/30 via-white/[0.17] to-white/[0.06] bg-clip-text font-light tabular-nums tracking-[-0.05em] text-transparent ${
          wide ? "text-[52px] sm:text-[74px]" : "text-[68px] sm:text-[96px]"
        }`}
      >
        {rating}
      </b>
    </span>
  );
}

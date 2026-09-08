/**
 * Il voto di una recensione: cifra grande e **sfumata** (bianco pieno in alto,
 * quasi trasparente in basso) con la stella accanto, in accent (richiesta utente
 * 2026-09-08: il vecchio "★ 9" da 14px si perdeva nella testata della card).
 *
 * Stessa famiglia delle altre cifre grandi del progetto — `font-light`,
 * `tabular-nums`, `tracking-[-0.04em]` — come il conto alla rovescia della
 * serata e la media di "Voti e recensioni".
 *
 * Nessun hook: lo usano sia `ReviewsClient` (client) sia `TitleTrivia` (server).
 */
export function ReviewScore({ rating }: { rating: number }) {
  return (
    <span
      className="flex shrink-0 items-start gap-1 leading-none"
      aria-label={`Voto ${rating} su 10`}
    >
      <span aria-hidden className="mt-[7px] text-[15px] text-accent-soft/80">
        ★
      </span>
      <b
        aria-hidden
        className="bg-gradient-to-b from-white via-white/80 to-accent-soft/45 bg-clip-text text-[36px] font-light tabular-nums tracking-[-0.04em] text-transparent"
      >
        {rating}
      </b>
    </span>
  );
}

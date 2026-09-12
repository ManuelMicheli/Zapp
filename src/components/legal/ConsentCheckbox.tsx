"use client";

import Link from "next/link";

/**
 * La casella di accettazione di termini e informativa.
 *
 * **Non è mai pre-spuntata**: una casella già segnata non è consenso valido
 * (CGUE C-673/17, Planet49). I due link si aprono in scheda nuova, così chi si
 * ferma a leggere non perde la schermata da cui è partito.
 *
 * Vive qui e non dentro `ConsentGate` perché la usano in due — il gate del
 * layout e il passo 0 dell'onboarding — e il testo accettato dev'essere lo
 * stesso in entrambi, per sempre.
 */
export function ConsentCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mt-8 flex cursor-pointer items-start gap-3 rounded-[14px] bg-surface-2 p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 accent-[var(--color-accent)]"
      />
      <span className="text-[14px] leading-relaxed text-text">
        Ho letto e accetto le{" "}
        <Link href="/termini" target="_blank" className="text-accent-soft underline">
          condizioni d&apos;uso
        </Link>{" "}
        e l&apos;
        <Link href="/privacy" target="_blank" className="text-accent-soft underline">
          informativa privacy
        </Link>
        .
      </span>
    </label>
  );
}

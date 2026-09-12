"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { concediConsenso } from "@/lib/legal/actions";

/** Cosa l'estensione legge davvero, in ordine di quanto è sensibile. */
const LEGGE = [
  "il titolo di quello che stai guardando",
  "stagione ed episodio, quando è una serie",
  "a che punto del video sei e se è in pausa",
  "su quale piattaforma lo stai guardando",
];

/**
 * Cosa **non** legge. Vale quanto l'elenco sopra, e per molti di più: chi
 * installa un'estensione che vede Netflix vuole sapere dove si ferma.
 */
const NON_LEGGE = [
  "nessun fotogramma e nessun audio del video",
  "nessuna password e nessun dato di pagamento",
  "nessuna altra scheda del browser, nessun'altra cronologia",
];

/**
 * Il consenso per la registrazione automatica delle visioni (art. 6(1)(a) GDPR).
 *
 * Sta **prima** del collegamento e non dopo: il momento in cui si chiede è il
 * momento in cui si decide. La casella non è mai pre-spuntata (CGUE C-673/17).
 *
 * Serve sia a chi collega ora, sia a chi un dispositivo ce l'ha già da prima che
 * questo consenso esistesse: per quelli la raccolta è sospesa finché non
 * accettano — non si può dare per dato un consenso che nessuno ha mai chiesto.
 */
export function ScrobbleConsent({ sospeso = false }: { sospeso?: boolean }) {
  const [accettato, setAccettato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const invia = () => {
    setErrore(null);
    startTransition(async () => {
      const esito = await concediConsenso("scrobble");
      if (!esito.ok) {
        setErrore(esito.error ?? "Non è stato possibile salvare. Riprova.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col rounded-[20px] border border-border bg-surface p-5">
      <h2 className="text-[17px] font-semibold text-text">
        {sospeso
          ? "La registrazione automatica è in pausa"
          : "Prima di collegare: cosa legge ZConnection"}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        {sospeso
          ? "I tuoi dispositivi sono ancora collegati, ma non stiamo registrando niente: manca il tuo consenso, e senza non raccogliamo nulla."
          : "È una scelta tua e puoi cambiarla quando vuoi dal profilo."}
      </p>

      <p className="mt-5 text-[13px] font-semibold text-text">Legge:</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-[14px] leading-relaxed text-muted">
        {LEGGE.map((voce) => (
          <li key={voce} className="flex gap-2">
            <span aria-hidden="true" className="text-accent-soft">
              ·
            </span>
            {voce}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[13px] font-semibold text-text">Non legge:</p>
      <ul className="mt-1.5 flex flex-col gap-1 text-[14px] leading-relaxed text-muted">
        {NON_LEGGE.map((voce) => (
          <li key={voce} className="flex gap-2">
            <span aria-hidden="true" className="text-muted-2">
              ·
            </span>
            {voce}
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[13px] leading-relaxed text-muted-2">
        Le sessioni registrate restano 90 giorni. Spegnendo questo consenso dal profilo le
        cancelliamo, e i dispositivi smettono di aggiornare la libreria senza doverli
        ricollegare. Il dettaglio sta nell&apos;
        <Link href="/privacy" target="_blank" className="text-accent-soft underline">
          informativa privacy
        </Link>
        .
      </p>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-[14px] bg-surface-2 p-4">
        <input
          type="checkbox"
          checked={accettato}
          onChange={(e) => setAccettato(e.target.checked)}
          className="mt-0.5 size-5 accent-[var(--color-accent)]"
        />
        <span className="text-[14px] leading-relaxed text-text">
          Acconsento alla registrazione automatica delle mie visioni.
        </span>
      </label>

      {errore && <p className="mt-3 text-[13px] text-danger">{errore}</p>}

      <Button
        className="mt-4 self-start"
        disabled={!accettato || pending}
        onClick={invia}
      >
        {pending ? "Salvataggio…" : sospeso ? "Riprendi la registrazione" : "Acconsento"}
      </Button>
    </section>
  );
}

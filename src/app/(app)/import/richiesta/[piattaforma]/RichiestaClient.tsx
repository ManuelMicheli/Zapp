"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toaster";
import { segnaRichiestaPiattaforma } from "@/lib/import/actions";

interface RichiestaAperta {
  requestedAt: string;
  expectedAt: string;
}

export interface RichiestaClientProps {
  piattaforma: string;
  /** Nome del servizio (pillola del catalogo: "Apple TV", non "Apple TV+"). */
  nome: string;
  /** Quanto ci vuole, in parole: è l'informazione che fa decidere. */
  tempo: string;
  dettaglio: string;
  href: string;
  /** NOW non ha un portale: il bottone apre il `mailto` già scritto. */
  isEmail: boolean;
  passi: string[];
  caricaSlug: string;
  richiestaAperta: RichiestaAperta | null;
}

const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

/**
 * "15 settembre": legge solo i primi 10 caratteri (`YYYY-MM-DD`) e mai il fuso
 * del browser — `requestedAt`/`expectedAt` sono già giorni, non istanti, e
 * passarli per `Date` locale li farebbe scivolare di un giorno a chi legge da
 * un fuso indietro rispetto a UTC.
 */
function formattaGiorno(iso: string): string {
  const [, mese, giorno] = iso.slice(0, 10).split("-").map(Number);
  return `${giorno} ${MESI[mese - 1]}`;
}

const ERRORE_GENERICO = "Non sono riuscito a segnare la richiesta. Riprova.";

/**
 * Contenuto interattivo della pagina di richiesta: una sola azione primaria
 * (apre il portale o l'email) più il bottone che segna la richiesta, oppure —
 * se una richiesta è già aperta — solo il rientro verso il caricamento del
 * file, senza offrire di richiederla una seconda volta.
 */
export function RichiestaClient({
  piattaforma,
  nome,
  tempo,
  dettaglio,
  href,
  isEmail,
  passi,
  caricaSlug,
  richiestaAperta,
}: RichiestaClientProps) {
  const router = useRouter();
  const { show } = useToast();
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  if (richiestaAperta) {
    return (
      <Card className="flex flex-col gap-4 p-5 lg:p-7">
        <p className="text-pretty text-[15px] leading-[1.45] text-white/80 lg:text-[17px]">
          L&apos;hai chiesta il {formattaGiorno(richiestaAperta.requestedAt)}, di solito
          arriva entro il {formattaGiorno(richiestaAperta.expectedAt)}.
        </p>
        <Link href={`/import/${caricaSlug}`}>
          <Button type="button" className="w-full">
            Carica il file
          </Button>
        </Link>
      </Card>
    );
  }

  function segna() {
    setErrore(null);
    startTransition(async () => {
      const ok = await segnaRichiestaPiattaforma(piattaforma);
      if (!ok) {
        setErrore(ERRORE_GENERICO);
        return;
      }
      show("Richiesta segnata: te lo ricordo quando dovrebbe arrivare.");
      router.push("/benvenuto");
    });
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-7">
      <Card className="flex flex-col gap-4 p-5 lg:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-semibold text-text lg:text-[17px]">
            {nome}
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted">
            {tempo}
          </span>
        </div>
        <p className="text-pretty text-[13px] leading-relaxed text-muted lg:text-sm">
          {dettaglio}
        </p>
      </Card>

      <div className="flex flex-col gap-3.5">
        {passi.map((testo, i) => (
          <div key={testo} className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/[0.18] text-xs font-bold text-accent-pale">
              {i + 1}
            </span>
            <p className="pt-0.5 text-sm leading-[1.45] text-white/80 lg:text-[15px]">
              {testo}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-[54px] items-center justify-center rounded-full bg-accent px-6 text-[15px] font-semibold text-white transition-colors hover:bg-accent-strong"
        >
          {isEmail ? "Scrivi l'email" : "Apri il sito"}
        </a>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={pending}
          onClick={segna}
        >
          {pending ? "Segno la richiesta…" : "L'ho richiesta"}
        </Button>
        {errore && <p className="text-sm text-danger">{errore}</p>}
      </div>
    </div>
  );
}

import Link from "next/link";
import { BackButton } from "@/components/layout/BackButton";

/**
 * Guscio delle pagine legali: leggibili da sloggati, quindi **non leggono mai il
 * database** — il ruolo `anon` non ha grant su niente e una query qui fallirebbe
 * in silenzio. Solo testo statico, quindi la pagina resta prerenderizzata.
 *
 * Il ritmo tipografico del corpo (titoli di sezione, elenchi, `code`) sta nella
 * classe `.legal-body` di `globals.css`: sono tre documenti lunghi, e ripetere le
 * stesse utility su ogni `<h2>` e ogni `<li>` renderebbe il testo illeggibile
 * proprio a chi lo deve mantenere.
 */
export function LegalPage({
  titolo,
  aggiornato,
  children,
}: {
  titolo: string;
  aggiornato: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-[760px] px-5 pb-16 pt-[calc(env(safe-area-inset-top,0px)+24px)] lg:px-10">
      <div className="mb-6 flex items-center gap-3">
        {/* `inline`: il BackButton di default è posizionato in assoluto, qui sta
            dentro una testata a riga e deve restare nel flusso. */}
        <BackButton inline />
        <span className="text-[13px] text-muted">Zapp</span>
      </div>
      <h1 className="text-[28px] font-semibold leading-tight text-text">{titolo}</h1>
      <p className="mt-2 text-[13px] text-muted-2">Ultimo aggiornamento: {aggiornato}</p>
      <div className="legal-body mt-8 space-y-6 text-[15px] leading-relaxed text-muted">
        {children}
      </div>
      <nav className="mt-12 flex flex-wrap gap-4 border-t border-border pt-6 text-[13px]">
        <Link href="/privacy" className="text-accent-soft">
          Informativa privacy
        </Link>
        <Link href="/termini" className="text-accent-soft">
          Condizioni d&apos;uso
        </Link>
        <Link href="/licenze" className="text-accent-soft">
          Licenze e attribuzioni
        </Link>
      </nav>
    </main>
  );
}

import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { getUserPlatforms } from "@/lib/platforms/user";
import { platformByKey } from "@/lib/platforms/catalog";
import { azioniPer, type AzionePiattaforma } from "@/lib/platforms/azioni";
import { PROVIDER_BRAND } from "@/lib/config";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Recuperiamo quello che hai già visto" };

/**
 * Congiunge una lista di nomi come si fa in italiano: virgole fra tutti tranne
 * l'ultimo, "e" prima dell'ultimo.
 */
function elencoItaliano(nomi: string[]): string {
  if (nomi.length <= 1) return nomi[0] ?? "";
  return `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
}

/**
 * Una card: una piattaforma, **una** azione primaria (il link che apre il sito
 * o l'email, sempre `target="_blank"`: i portali privacy chiedono il login e
 * non devono aprirsi dentro la WebView del guscio nativo) e il rientro verso
 * l'import quando il file è pronto. Nessuno stato "fatto"/"richiesto": arriva
 * con la fase successiva, che porta la memoria delle richieste — questa card
 * non ha niente da riscrivere per riceverlo.
 */
function AzioneCard({ azione }: { azione: AzionePiattaforma }) {
  const providerId = platformByKey(azione.key)?.providerId;
  const colore = providerId != null ? PROVIDER_BRAND[providerId] : undefined;
  const etichettaCTA = azione.href?.startsWith("mailto:")
    ? "Scrivi l'email"
    : "Apri il sito";

  return (
    <li>
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colore ?? "var(--color-muted)" }}
            />
            <span className="text-[15px] font-semibold text-text">{azione.nome}</span>
          </span>
          <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted">
            {azione.tempo}
          </span>
        </div>
        <div>
          <p className="text-[15px] font-medium text-text">{azione.titolo}</p>
          <p className="mt-1 text-pretty text-[13px] leading-relaxed text-muted">
            {azione.dettaglio}
          </p>
        </div>
        <div className="flex items-center gap-5">
          {azione.href && (
            <a
              href={azione.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-strong"
            >
              {etichettaCTA}
            </a>
          )}
          {azione.caricaSlug && (
            <Link
              href={`/import/${azione.caricaSlug}`}
              className="text-[13px] font-medium text-accent-soft"
            >
              Carica il file
            </Link>
          )}
        </div>
      </Card>
    </li>
  );
}

/**
 * Server Component: legge l'utente come le altre pagine di `(app)` (`getViewer`),
 * poi le piattaforme dichiarate in fase di iscrizione, poi `azioniPer` le
 * trasforma in card — prima quelle che si chiudono subito, poi quelle che
 * aprono un'attesa.
 */
export default async function BenvenutoPage() {
  const viewer = await getViewer();
  const chiavi = viewer ? await getUserPlatforms(viewer.id) : [];
  const { subito, attesa, senzaStrada } = azioniPer(chiavi);
  const nessunaCard =
    subito.length === 0 && attesa.length === 0 && senzaStrada.length === 0;

  return (
    <main className="relative px-5 pb-[150px] md:px-8 lg:px-10 lg:pb-36">
      <div className="mx-auto max-w-[720px]">
        <header className="pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+40px)]">
          <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em] lg:text-[40px]">
            Recuperiamo quello che hai già visto
          </h1>
          <p className="mt-4 text-pretty text-[15px] leading-[1.45] text-white/80 lg:mt-5 lg:text-[17px]">
            Per ogni piattaforma che guardi, un passo solo: qualcuna si chiude subito,
            altre aprono una richiesta e un po&apos; di attesa.
          </p>
        </header>

        {subito.length > 0 && (
          <ul className="mt-8 flex flex-col gap-3 lg:mt-10">
            {subito.map((azione) => (
              <AzioneCard key={azione.key} azione={azione} />
            ))}
          </ul>
        )}

        {attesa.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {attesa.map((azione) => (
              <AzioneCard key={azione.key} azione={azione} />
            ))}
          </ul>
        )}

        {senzaStrada.length > 0 && (
          <p className="mt-6 text-pretty text-[13px] leading-relaxed text-muted">
            Di {elencoItaliano(senzaStrada)} non esiste un export: quello che guardi lì lo
            prende ZConnection mentre lo guardi.
          </p>
        )}

        {nessunaCard && (
          <p className="mt-8 text-pretty text-[15px] leading-[1.45] text-muted">
            Non hai dichiarato nessuna piattaforma in fase di iscrizione: puoi sempre
            importare la tua cronologia più avanti, dal profilo.
          </p>
        )}

        <div className="mt-10 text-center lg:mt-12">
          <Link href="/" className="text-[14px] font-medium text-accent-soft">
            Lo faccio dopo
          </Link>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { getUserPlatforms } from "@/lib/platforms/user";
import { platformByKey } from "@/lib/platforms/catalog";
import {
  azioniPer,
  cardsAttesa,
  type AzionePiattaforma,
  type CardAttesa,
} from "@/lib/platforms/azioni";
import { richiesteUtente } from "@/lib/import/richieste-store";
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
 * "15 settembre": stessa lettura di `formattaGiorno` in
 * `RichiestaClient.tsx` (solo i primi 10 caratteri, mai il fuso del
 * browser — le date sono già giorni, non istanti). Duplicata invece di
 * condivisa: è una riga sola e questa pagina non è client, quella sì.
 */
function formattaGiorno(iso: string): string {
  const [, mese, giorno] = iso.slice(0, 10).split("-").map(Number);
  return `${giorno} ${MESI[mese - 1]}`;
}

/**
 * Una card per le piattaforme "subito" (oggi solo Netflix): **una** azione
 * primaria (il link che apre il sito, sempre `target="_blank"`) e il rientro
 * verso l'import quando il file è pronto. Non ha stati: si chiude da sé,
 * senza passare da una richiesta.
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
 * Una card per le piattaforme "ad attesa", nella forma decisa da
 * `cardsAttesa` (`src/lib/platforms/azioni.ts`): **da fare** porta a
 * `/import/richiesta/<key>`, dove si apre il portale e si segna la
 * richiesta; **richiesta** mostra le due date (stesso formato di
 * `RichiestaClient`) e il rientro per caricare il file; **importata** è
 * spenta, senza azione — è fatta, non c'è più niente da decidere lì.
 */
function AzioneAttesaCard({ azione }: { azione: CardAttesa }) {
  const providerId = platformByKey(azione.key)?.providerId;
  const colore = providerId != null ? PROVIDER_BRAND[providerId] : undefined;
  const importata = azione.stato === "importata";

  return (
    <li>
      <Card className={`flex flex-col gap-4 p-5 ${importata ? "opacity-50" : ""}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colore ?? "var(--color-muted)" }}
            />
            <span className="text-[15px] font-semibold text-text">{azione.nome}</span>
          </span>
          {importata ? (
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted">
              Importato
            </span>
          ) : (
            <span className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted">
              {azione.tempo}
            </span>
          )}
        </div>

        {azione.stato === "da-fare" && (
          <>
            <div>
              <p className="text-[15px] font-medium text-text">{azione.titolo}</p>
              <p className="mt-1 text-pretty text-[13px] leading-relaxed text-muted">
                {azione.dettaglio}
              </p>
            </div>
            <Link
              href={`/import/richiesta/${azione.key}`}
              className="self-start rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-strong"
            >
              Richiedi i tuoi dati
            </Link>
          </>
        )}

        {azione.stato === "richiesta" && azione.richiestaIl && azione.arrivoAtteso && (
          <>
            <p className="text-pretty text-[13px] leading-relaxed text-muted">
              Richiesta il {formattaGiorno(azione.richiestaIl)}, di solito arriva entro il{" "}
              {formattaGiorno(azione.arrivoAtteso)}.
            </p>
            {azione.caricaSlug && (
              <Link
                href={`/import/${azione.caricaSlug}`}
                className="self-start rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-accent-strong"
              >
                Carica il file
              </Link>
            )}
          </>
        )}

        {importata && (
          <p className="text-pretty text-[13px] leading-relaxed text-muted">
            L&apos;hai già importata: non c&apos;è altro da fare qui.
          </p>
        )}
      </Card>
    </li>
  );
}

/**
 * Server Component: legge l'utente come le altre pagine di `(app)` (`getViewer`),
 * poi le piattaforme dichiarate in fase di iscrizione e le richieste aperte o
 * chiuse (`richiesteUtente`). `azioniPer` decide le card "subito" (si chiudono
 * da sé), `cardsAttesa` decide le card "ad attesa" e la loro forma — da fare,
 * richiesta o importata. La pagina non decide niente: legge, chiama, rende.
 */
export default async function BenvenutoPage() {
  const viewer = await getViewer();
  const chiavi = viewer ? await getUserPlatforms(viewer.id) : [];
  const richieste = viewer ? await richiesteUtente(viewer.id) : [];
  const { subito, senzaStrada } = azioniPer(chiavi);
  const attesa = cardsAttesa(chiavi, richieste);
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
              <AzioneAttesaCard key={azione.key} azione={azione} />
            ))}
          </ul>
        )}

        {senzaStrada.length > 0 && (
          <p className="mt-6 text-pretty text-[13px] leading-relaxed text-muted">
            Di {elencoItaliano(senzaStrada)} non esiste ancora un modo di importare la
            cronologia: quello che guardi lì lo segni tu, titolo per titolo.
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

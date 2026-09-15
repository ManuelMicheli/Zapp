import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/layout/BackButton";
import { getViewer } from "@/lib/auth/viewer";
import { azioniPer } from "@/lib/platforms/azioni";
import { GIORNI_ATTESA } from "@/lib/import/richieste";
import { richiesteAperte } from "@/lib/import/richieste-store";
import { RichiestaClient } from "./RichiestaClient";

/**
 * Le uniche quattro piattaforme con una pagina di richiesta sono quelle di
 * `GIORNI_ATTESA` (`src/lib/import/richieste.ts`): stessa fonte, non un elenco
 * scritto una seconda volta qui.
 */
const CHIAVI_VALIDE = Object.keys(GIORNI_ATTESA);

function isChiaveValida(value: string): boolean {
  return CHIAVI_VALIDE.includes(value);
}

/** I passi non stanno in `azioni.ts` (che porta solo l'azione unica di `/benvenuto`):
 * questa pagina li scrive per esteso, senza toccare gli indirizzi, che restano
 * l'unica fonte in `azioniPer`. */
const PASSI: Record<string, string[]> = {
  "apple-tv": [
    "Apri privacy.apple.com e accedi con il tuo Apple ID.",
    'Scegli "Richiedi una copia dei tuoi dati" e seleziona Apple TV / Acquisti e contenuti multimediali.',
    "Invia la richiesta: Apple prepara un archivio da scaricare, di solito entro una settimana.",
  ],
  "prime-video": [
    "Apri il centro privacy di Amazon e accedi con il tuo account.",
    "Chiedi i dati del tuo account, inclusa l'attività di visione su Prime Video.",
    "Amazon prepara un file da scaricare, di solito in pochi giorni.",
  ],
  "disney-plus": [
    "Apri il portale dei diritti sui dati di Disney e accedi con il tuo account Disney+.",
    "Scegli la richiesta di accesso ai tuoi dati personali.",
    "Disney prepara un export scaricabile: può volerci fino a un mese.",
  ],
  now: [
    "NOW non ha un portale self-service: la richiesta si fa per email a Sky.",
    "Il bottone qui sotto apre già un'email pronta, con oggetto e testo compilati: controlla e premi invia.",
    "Sky risponde di solito entro un mese, con i dati allegati o un link per scaricarli.",
  ],
};

export function generateStaticParams() {
  return CHIAVI_VALIDE.map((piattaforma) => ({ piattaforma }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ piattaforma: string }>;
}) {
  const { piattaforma } = await params;
  if (!isChiaveValida(piattaforma)) return { title: "Richiedi i tuoi dati" };
  const azione = azioniPer([piattaforma]).attesa[0];
  return { title: azione ? azione.titolo : "Richiedi i tuoi dati" };
}

export default async function RichiestaPage({
  params,
}: {
  params: Promise<{ piattaforma: string }>;
}) {
  const { piattaforma } = await params;
  if (!isChiaveValida(piattaforma)) notFound();

  const azione = azioniPer([piattaforma]).attesa[0];
  // Non dovrebbe mai mancare per una chiave di GIORNI_ATTESA (sono le stesse
  // quattro di `azioni.ts`), ma questa pagina non ha niente da mostrare senza:
  // meglio un 404 onesto che una pagina vuota.
  if (!azione) notFound();

  const viewer = await getViewer();
  const aperte = viewer ? await richiesteAperte(viewer.id) : [];
  const richiestaAperta = aperte.find((r) => r.platformKey === piattaforma) ?? null;

  return (
    <main className="relative px-5 pb-[150px] md:px-8 lg:px-10 lg:pb-36">
      <div className="mx-auto max-w-[720px]">
        <header className="relative flex items-center gap-3.5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:gap-5 lg:pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+40px)]">
          <BackButton inline />
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              data-crumb
              href="/benvenuto"
              className="text-[13px] font-medium text-accent-soft focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-pale"
            >
              Il tuo pregresso
            </Link>
            <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em] lg:text-[40px]">
              {azione.titolo}
            </h1>
          </div>
        </header>

        <div className="relative mt-7 lg:mt-10">
          <RichiestaClient
            piattaforma={piattaforma}
            nome={azione.nome}
            tempo={azione.tempo}
            dettaglio={azione.dettaglio}
            href={azione.href ?? ""}
            isEmail={(azione.href ?? "").startsWith("mailto:")}
            passi={PASSI[piattaforma] ?? []}
            caricaSlug={azione.caricaSlug ?? "export"}
            richiestaAperta={
              richiestaAperta
                ? {
                    requestedAt: richiestaAperta.requestedAt,
                    expectedAt: richiestaAperta.expectedAt,
                  }
                : null
            }
          />
        </div>
      </div>
    </main>
  );
}

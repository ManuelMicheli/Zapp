"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ConnectButton } from "./ConnectButton";

const EXTENSION_FOLDER = String.raw`D:\PROGETTI\Zapp\.claude\worktrees\zconn-multi\extension`;
const DOWNLOAD = "/downloads/zconnection-1.3.0.zip";

/** Guida temporanea per la distribuzione manuale dell'estensione. */
export function ConnectionGuide() {
  const [browser, setBrowser] = useState<"chrome" | "edge">("chrome");
  const [notice, setNotice] = useState("");
  const address = `${browser}://extensions`;

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copiato.`);
    } catch {
      setNotice(
        "Seleziona e copia il testo qui sopra: il browser non consente la copia automatica.",
      );
    }
  }

  return (
    <section id="zconnection-guide" aria-labelledby="connection-title">
      <div className="grid items-center gap-8 border-b border-border pb-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <div>
          <p className="mb-3 text-[15px] font-medium text-accent-light">ZConnection</p>
          <h2
            id="connection-title"
            className="max-w-[580px] text-[38px] font-semibold leading-[1.06] tracking-[-0.045em] sm:text-[52px]"
          >
            Tu guarda.
            <br />
            La libreria si aggiorna.
          </h2>
          <p className="mt-5 max-w-[480px] text-[16px] leading-relaxed text-muted">
            Collega una volta questo browser al tuo account Zapp. ZConnection riconosce
            quello che guardi e salva titolo, episodio e punto di ripresa.
          </p>
          <a
            href="#connection-install"
            className="glass-accent mt-6 inline-flex min-h-12 items-center rounded-full px-6 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light"
          >
            Configura ZConnection
          </a>
        </div>

        <div
          className="overflow-hidden rounded-[24px] border border-white/10 bg-surface"
          aria-label="Come funziona ZConnection"
        >
          <div
            className="flex items-center gap-1.5 border-b border-border px-5 py-4"
            aria-hidden="true"
          >
            <span className="size-2 rounded-full bg-white/25" />
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/10" />
            <span className="ml-auto text-xs text-muted">Il tuo browser</span>
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-[18px] font-semibold tracking-tight">
              <span>Netflix</span>
              <span>Prime Video</span>
              <span>NOW</span>
              <span>Disney+</span>
            </div>
            <div className="my-5 flex items-center gap-3 text-accent-light">
              <span className="h-px flex-1 bg-accent-light/25" />
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="size-7"
                aria-hidden="true"
              >
                <path d="M7 7h11m0 0-4-4m4 4-4 4M17 17H6m0 0 4-4m-4 4 4 4" />
              </svg>
              <span className="h-px flex-1 bg-accent-light/25" />
            </div>
            <p className="text-[23px] font-semibold tracking-tight">
              La tua libreria Zapp
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Film, episodi e minuti visti, aggiornati durante la riproduzione.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 border-b border-border py-6 text-sm leading-relaxed sm:grid-cols-2 sm:gap-10">
        <p>
          <span className="mb-1 block font-semibold text-text">
            Sul computer, in Chrome o Edge
          </span>
          <span className="text-muted">
            Netflix, Prime Video su primevideo.com, NOW su nowtv.it e Disney+ senza
            pubblicità. Prime Video su amazon.it non è ancora incluso.
          </span>
        </p>
        <p>
          <span className="mb-1 block font-semibold text-text">
            Solo dove installi ZConnection
          </span>
          <span className="text-muted">
            Le visioni da app sul telefono, smart TV, Safari e Firefox non si
            sincronizzano con questa estensione.
          </span>
        </p>
      </div>

      <ol className="divide-y divide-border">
        <li
          id="connection-install"
          className="grid scroll-mt-28 gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10"
        >
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">01</span>Installa
          </h3>
          <div className="min-w-0 space-y-5">
            <p className="max-w-[640px] text-[15px] leading-relaxed text-muted">
              Per ora ZConnection si installa manualmente. Scarica lo ZIP 1.3.0, estrailo
              in una cartella che conserverai e apri la pagina delle estensioni.
            </p>
            <a
              href={DOWNLOAD}
              download
              className="glass inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light"
            >
              Scarica ZConnection 1.3.0
            </a>
            <div className="rounded-2xl bg-surface p-4 sm:p-5">
              <div className="mb-4 flex gap-2" aria-label="Browser da configurare">
                {(["chrome", "edge"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={browser === item}
                    onClick={() => {
                      setBrowser(item);
                      setNotice("");
                    }}
                    className={`min-h-11 rounded-full px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent-light ${browser === item ? "glass-accent" : "text-muted hover:text-text"}`}
                  >
                    {item === "chrome" ? "Chrome" : "Edge"}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <code className="select-all text-sm text-accent-pale">{address}</code>
                <Button
                  variant="secondary"
                  className="h-11 px-4 text-sm"
                  onClick={() => copy(address, "Indirizzo")}
                >
                  Copia indirizzo
                </Button>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Incolla l&rsquo;indirizzo nella barra del browser. Attiva{" "}
                <strong className="font-medium text-text">Modalità sviluppatore</strong>,
                scegli{" "}
                <strong className="font-medium text-text">
                  Carica estensione non pacchettizzata
                </strong>{" "}
                e seleziona la cartella che contiene <code>manifest.json</code>.
              </p>
            </div>
            <details className="group rounded-2xl border border-border px-4 py-1 sm:px-5">
              <summary className="cursor-pointer py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent-light">
                Cartella esatta su questo PC di sviluppo
              </summary>
              <p className="mb-3 text-sm leading-relaxed text-muted">
                Qui la versione 1.3.0 è già pronta: puoi selezionare direttamente questa
                cartella, senza scaricare lo ZIP. Il percorso vale solo su questo PC.
              </p>
              <code className="block select-all break-all text-[13px] leading-relaxed text-accent-pale">
                {EXTENSION_FOLDER}
              </code>
              <Button
                variant="secondary"
                className="my-4 h-11 px-4 text-sm"
                onClick={() => copy(EXTENSION_FOLDER, "Percorso")}
              >
                Copia percorso
              </Button>
            </details>
            <p role="status" className="text-sm text-accent-pale">
              {notice}
            </p>
          </div>
        </li>
        <li className="grid gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10">
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">02</span>Collega
          </h3>
          <div className="space-y-4">
            <p className="max-w-[640px] text-[15px] leading-relaxed text-muted">
              Apri Zapp nello stesso browser e accedi all&rsquo;account che vuoi
              aggiornare. Premi il pulsante qui sotto: il collegamento rimane salvato
              anche quando chiudi e riapri il browser.
            </p>
            <div className="max-w-[480px]">
              <ConnectButton />
            </div>
            <p className="text-sm leading-relaxed text-muted">
              Se lo hai già collegato, passa alla visione: non serve collegarlo di nuovo a
              ogni accesso o per ogni piattaforma.
            </p>
          </div>
        </li>
        <li className="grid gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10">
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">03</span>Guarda
          </h3>
          <div className="space-y-4">
            <p className="max-w-[640px] text-[15px] leading-relaxed text-muted">
              Ricarica la scheda di Netflix, Prime Video, NOW o Disney+ e avvia un film o
              un episodio. Apri ZConnection dal menu Estensioni del browser: vedrai la
              piattaforma, il titolo e il minuto di visione.
            </p>
            <p className="max-w-[640px] text-sm leading-relaxed text-muted">
              Se compare{" "}
              <strong className="font-medium text-text">
                Attiva il riconoscimento automatico
              </strong>
              , premilo e autorizza l&rsquo;accesso ai siti supportati. Puoi fissare
              ZConnection alla barra per ritrovarla subito.
            </p>
            <Link
              href="/library"
              className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-light underline-offset-4 hover:underline"
            >
              Apri la tua libreria
            </Link>
          </div>
        </li>
      </ol>

      <div className="rounded-[20px] bg-surface p-5 sm:p-6">
        <h3 className="text-[17px] font-semibold">Da qui in poi, fa da sé</h3>
        <p className="mt-2 max-w-[760px] text-sm leading-relaxed text-muted">
          Lascia l&rsquo;estensione attiva: durante la visione invia aggiornamenti circa
          ogni 30 secondi e ai cambi di stato. Non occorre tenere aperto Zapp. Il
          collegamento resta all&rsquo;account scelto finché non lo scolleghi; puoi
          mettere in pausa la sincronizzazione dai dispositivi qui sotto.
        </p>
        <details className="mt-4 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent-light">
            Come aggiorno l&rsquo;estensione?
          </summary>
          <p className="mt-3 max-w-[760px] text-sm leading-relaxed text-muted">
            La libreria si aggiorna automaticamente; questa installazione manuale
            dell&rsquo;estensione no. Quando è disponibile una nuova versione, sostituisci
            i file nella stessa cartella, premi Ricarica nella pagina Estensioni e
            ricarica le schede delle piattaforme. Non rimuovere ZConnection: così conservi
            il collegamento. Accetta eventuali nuovi permessi richiesti.
          </p>
        </details>
      </div>
    </section>
  );
}

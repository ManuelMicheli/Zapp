"use client";

/**
 * La guida che la TV promette: "Apri Zapp → Dispositivi → Attiva il
 * tracciamento completo".
 *
 * Zapp non puo' concedere il permesso da sola — e' una pagina web, e su Fire OS
 * nemmeno il televisore puo' concederselo (adbd non serve i chiamanti locali,
 * misurato il 12/09/2026). Quindi qui si compongono le righe da incollare in un
 * terminale, con l'IP e il nome del servizio gia' dentro.
 *
 * Il passo che conta e' il quinto: `settings put` **sostituisce l'intero
 * elenco** degli ascoltatori di notifiche. Per questo il comando di scrittura
 * non esiste finche' non si e' incollata la risposta della lettura: senza, si
 * spegnerebbe il permesso alle altre app del televisore.
 */

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import {
  ASCOLTATORI,
  comandi,
  eIndirizzoPrivato,
  normalizzaIp,
  type AppTv,
  type Sistema,
} from "@/lib/devices/listeners";

/** La pagina ufficiale di platform-tools: adb sta li' dentro, senza installare nulla. */
const PLATFORM_TOOLS = "https://developer.android.com/tools/releases/platform-tools";

/** Su Mac il file scaricato non ha il permesso di esecuzione: si avvia cosi'. */
const AVVIO_MAC = "bash ~/Downloads/attiva-tracciamento-zapp.command";

const SISTEMI: { chiave: Sistema; etichetta: string }[] = [
  { chiave: "windows", etichetta: "Windows" },
  { chiave: "unix", etichetta: "Mac o Linux" },
];

export function TvTrackingGuide({ ipIniziale = "" }: { ipIniziale?: string }) {
  const [app, setApp] = useState<AppTv>("zapp-tv");
  const [sistema, setSistema] = useState<Sistema>("windows");
  const [ip, setIp] = useState(ipIniziale);
  const [letto, setLetto] = useState("");
  const [avviso, setAvviso] = useState("");

  const ipValido = normalizzaIp(ip);
  const fuoriRete = ipValido !== null && !eIndirizzoPrivato(ipValido);
  const componente = ASCOLTATORI[app].componente;
  const passi = comandi(sistema, ipValido ?? "192.168.1.100", componente, letto);
  const haLetto = letto.trim() !== "";
  // Lo script porta l'indirizzo dentro un file eseguibile: si offre solo quando
  // l'indirizzo e' davvero quello di una TV sulla rete di casa.
  const scarica =
    ipValido !== null && !fuoriRete
      ? `/api/devices/tv-script?ip=${encodeURIComponent(ipValido)}&app=${app}&os=${sistema}`
      : null;

  async function copia(valore: string, etichetta: string) {
    try {
      await navigator.clipboard.writeText(valore);
      setAvviso(`${etichetta} copiato.`);
    } catch {
      setAvviso(
        "Seleziona e copia il testo: il browser non consente la copia automatica.",
      );
    }
  }

  /** Una riga di comando con il suo bottone: si ripete sei volte. */
  function Comando({ testo, etichetta }: { testo: string; etichetta: string }) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
        <code className="select-all break-all font-mono text-[13px] leading-relaxed text-accent-pale">
          {testo}
        </code>
        <Button
          variant="secondary"
          className="h-10 shrink-0 px-4 text-sm"
          onClick={() => copia(testo, etichetta)}
        >
          Copia
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rounded-[20px] border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-[17px] font-semibold">Cosa serve</h2>
        <p className="mt-2 max-w-[680px] text-sm leading-relaxed text-muted">
          Un computer acceso sulla <strong className="text-text">stessa rete</strong> del
          televisore e una decina di minuti. Non si installa niente sul televisore e non
          si tocca il tuo account: si accende solo un permesso che Fire OS non espone a
          schermo.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Quale app c&rsquo;è sulla TV</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(ASCOLTATORI) as AppTv[]).map((chiave) => (
                <button
                  key={chiave}
                  type="button"
                  aria-pressed={app === chiave}
                  onClick={() => setApp(chiave)}
                  className={`min-h-11 rounded-full px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent-light ${app === chiave ? "glass-accent" : "text-muted hover:text-text"}`}
                >
                  {ASCOLTATORI[chiave].etichetta}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Che computer usi</p>
            <div className="flex flex-wrap gap-2">
              {SISTEMI.map(({ chiave, etichetta }) => (
                <button
                  key={chiave}
                  type="button"
                  aria-pressed={sistema === chiave}
                  onClick={() => setSistema(chiave)}
                  className={`min-h-11 rounded-full px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent-light ${sistema === chiave ? "glass-accent" : "text-muted hover:text-text"}`}
                >
                  {etichetta}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label htmlFor="ip-tv" className="mb-2 block text-sm font-medium">
            Indirizzo della TV
          </label>
          <input
            id="ip-tv"
            inputMode="decimal"
            autoComplete="off"
            placeholder="192.168.1.221"
            value={ip}
            onChange={(event) => setIp(event.target.value)}
            className="h-12 w-full max-w-[280px] rounded-2xl border border-border bg-surface-2 px-4 font-mono text-[15px] outline-none focus-visible:border-accent-light"
          />
          <p className="mt-2 max-w-[560px] text-sm leading-relaxed text-muted">
            {ip.trim() === ""
              ? "Lo mostra la TV stessa, nella schermata “Manca un permesso”. In alternativa: Impostazioni → Rete, poi il nome della rete."
              : ipValido === null
                ? "Non sembra un indirizzo: quattro numeri separati da punti, senza la porta."
                : fuoriRete
                  ? "Questo non è un indirizzo di rete locale: probabilmente hai copiato l’IP pubblico della connessione, non quello della TV."
                  : "Va bene. I comandi qui sotto puntano a questa TV."}
          </p>
        </div>
      </section>

      <section className="rounded-[20px] border border-accent-light/30 bg-surface p-5 sm:p-6">
        <h2 className="text-[17px] font-semibold">Il modo veloce: un file solo</h2>
        <p className="mt-2 max-w-[680px] text-sm leading-relaxed text-muted">
          Scarica questo file sul computer e aprilo: fa tutto da sé — prende gli strumenti
          da Google, si collega alla TV, aggiunge il permesso{" "}
          <strong className="text-text">senza togliere quelli delle altre app</strong> e
          verifica. Restano a te solo le due cose che si fanno col telecomando: accendere
          Debug ADB (passo 01) e confermare il messaggio che appare sul televisore.
        </p>
        {scarica ? (
          <a
            href={scarica}
            download
            className="glass-accent mt-5 inline-flex min-h-12 items-center rounded-full px-6 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light"
          >
            Scarica lo script per {sistema === "windows" ? "Windows" : "Mac o Linux"}
          </a>
        ) : (
          <p className="mt-5 text-sm text-muted">
            Scrivi qui sopra l&rsquo;indirizzo della TV e il file compare.
          </p>
        )}
        <p className="mt-4 max-w-[680px] text-sm leading-relaxed text-muted">
          {sistema === "windows" ? (
            <>
              Doppio clic sul file scaricato. La prima volta Windows avvisa che il file
              arriva da internet: <em>Ulteriori informazioni → Esegui comunque</em>.
            </>
          ) : (
            <>
              Un file scaricato non è eseguibile col doppio clic: apri il Terminale e
              incolla questa riga.
            </>
          )}
        </p>
        {sistema === "unix" && (
          <div className="mt-3">
            <Comando testo={AVVIO_MAC} etichetta="Comando" />
          </div>
        )}
      </section>

      <div className="border-t border-border pt-8">
        <h2 className="text-[17px] font-semibold">Oppure, passo per passo</h2>
        <p className="mt-2 max-w-[680px] text-sm leading-relaxed text-muted">
          Gli stessi comandi, uno alla volta, se preferisci vedere cosa succede o se lo
          script non parte.
        </p>
      </div>

      <ol className="divide-y divide-border">
        <li className="grid gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10">
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">01</span>Apri la TV
          </h3>
          <div className="min-w-0 space-y-3 text-[15px] leading-relaxed text-muted">
            <p>
              Sul televisore:{" "}
              <em>Impostazioni → Il mio Fire TV → Opzioni sviluppatore</em> e accendi{" "}
              <strong className="font-medium text-text">Debug ADB</strong>.
            </p>
            <p className="text-sm">
              Se “Opzioni sviluppatore” non compare, entra in{" "}
              <em>Impostazioni → Il mio Fire TV → Informazioni</em> e premi sette volte
              sul nome del dispositivo: il menu appare.
            </p>
          </div>
        </li>

        <li className="grid gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10">
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">02</span>Prendi adb
          </h3>
          <div className="min-w-0 space-y-3 text-[15px] leading-relaxed text-muted">
            <p>
              Sul computer scarica{" "}
              <strong className="font-medium text-text">SDK Platform-Tools</strong>, lo
              strumento ufficiale di Google. È uno ZIP: si estrae in una cartella, non si
              installa.
            </p>
            <a
              href={PLATFORM_TOOLS}
              target="_blank"
              rel="noreferrer"
              className="glass inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-light"
            >
              Apri la pagina di Google
            </a>
            <p className="text-sm">
              Poi apri un terminale{" "}
              <strong className="font-medium text-text">dentro quella cartella</strong>:
              {sistema === "windows"
                ? " in Esplora file, clic destro sulla cartella → “Apri nel terminale”."
                : " nel Terminale scrivi cd e trascina dentro la cartella."}
            </p>
          </div>
        </li>

        <li className="grid gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10">
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">03</span>Collega
          </h3>
          <div className="min-w-0 space-y-3">
            <Comando testo={passi.connetti} etichetta="Comando" />
            <p className="text-[15px] leading-relaxed text-muted">
              Sul televisore compare <em>“Consentire il debug USB?”</em>: scegli{" "}
              <strong className="font-medium text-text">Consenti sempre</strong> con il
              telecomando. Se il terminale dice <code>connected</code>, sei dentro.
            </p>
          </div>
        </li>

        <li className="grid gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10">
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">04</span>Leggi
          </h3>
          <div className="min-w-0 space-y-3">
            <Comando testo={passi.leggi} etichetta="Comando" />
            <p className="text-[15px] leading-relaxed text-muted">
              Questo <strong className="font-medium text-text">legge</strong> le app che
              possono già vedere le notifiche. Incolla qui sotto la risposta, tale e
              quale: spesso è una riga sola, oppure la parola <code>null</code>.
            </p>
            <textarea
              rows={2}
              value={letto}
              spellCheck={false}
              onChange={(event) => setLetto(event.target.value)}
              placeholder="Incolla qui la risposta del comando"
              className="w-full rounded-2xl border border-border bg-surface-2 px-4 py-3 font-mono text-[13px] leading-relaxed outline-none focus-visible:border-accent-light"
            />
            <Button
              variant="secondary"
              className="h-10 px-4 text-sm"
              onClick={() => setLetto("null")}
            >
              Ha risposto null
            </Button>
          </div>
        </li>

        <li className="grid gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10">
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">05</span>Concedi
          </h3>
          <div className="min-w-0 space-y-3">
            {haLetto ? (
              <>
                <Comando testo={passi.scrivi} etichetta="Comando" />
                <p className="text-[15px] leading-relaxed text-muted">
                  Dentro c&rsquo;è quello che la TV aveva già,{" "}
                  <strong className="font-medium text-text">più</strong>{" "}
                  {ASCOLTATORI[app].etichetta}. Il comando non risponde niente: è normale.
                </p>
              </>
            ) : (
              <p className="rounded-2xl border border-border bg-surface px-4 py-3 text-[15px] leading-relaxed text-muted">
                Il comando compare appena incolli la risposta del passo 04. Non è una
                formalità: questa impostazione{" "}
                <strong className="font-medium text-text">
                  si riscrive tutta intera
                </strong>
                , e scriverla senza aver letto prima toglierebbe l&rsquo;accesso alle
                notifiche alle altre app del televisore.
              </p>
            )}
          </div>
        </li>

        <li className="grid gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10">
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">06</span>Verifica
          </h3>
          <div className="min-w-0 space-y-3">
            <Comando testo={passi.verifica} etichetta="Comando" />
            <p className="text-[15px] leading-relaxed text-muted">
              Nella risposta deve comparire{" "}
              <code className="break-all">{componente}</code>. Poi riapri{" "}
              {ASCOLTATORI[app].etichetta} sul televisore: deve dire{" "}
              <strong className="font-medium text-text">Tracciamento completo</strong>.
              L&rsquo;app va riaperta davvero — appena concesso, il servizio non riparte
              da solo.
            </p>
          </div>
        </li>

        <li className="grid gap-4 py-8 sm:grid-cols-[180px_1fr] lg:gap-10">
          <h3 className="text-lg font-semibold">
            <span className="mr-3 text-accent-light">07</span>Chiudi
          </h3>
          <div className="min-w-0 space-y-3">
            <Comando testo={passi.disconnetti} etichetta="Comando" />
            <p className="text-[15px] leading-relaxed text-muted">
              E rispegni <strong className="font-medium text-text">Debug ADB</strong> sul
              televisore, dove lo avevi acceso: il permesso appena dato resta, il debug
              non serve più.
            </p>
          </div>
        </li>
      </ol>

      <p role="status" className="text-sm text-accent-pale">
        {avviso}
      </p>

      <div className="rounded-[20px] bg-surface p-5 sm:p-6">
        <h2 className="text-[17px] font-semibold">Se qualcosa non va</h2>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-muted">
          <li>
            <strong className="font-medium text-text">
              “failed to connect” o nessuna risposta:
            </strong>{" "}
            il computer non è sulla stessa rete della TV, oppure Debug ADB è spento.
            Ricontrolla l&rsquo;indirizzo: cambia a ogni riaccensione del televisore.
          </li>
          <li>
            <strong className="font-medium text-text">“device unauthorized”:</strong> il
            popup sulla TV non è stato confermato. Ridai il comando del passo 03 e guarda
            lo schermo.
          </li>
          <li>
            <strong className="font-medium text-text">
              La verifica mostra il servizio ma l&rsquo;app dice “Modalità base”:
            </strong>{" "}
            chiudi del tutto l&rsquo;app sulla TV e riaprila.
          </li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Senza questo permesso l&rsquo;app resta utile lo stesso: i titoli li dichiara
          Zapp quando è lei ad aprirli sulla TV.{" "}
          <Link
            href="/devices"
            className="text-accent-light underline-offset-4 hover:underline"
          >
            Torna ai dispositivi
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

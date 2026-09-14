"use client";

/**
 * Le TV viste sulla rete locale, dentro l'app.
 *
 * Esiste solo nel guscio nativo: da browser la scheda resta quella di sempre,
 * col codice a sei cifre. **L'elenco non sostituisce mai il codice**, lo
 * affianca: su una rete che filtra il multicast qui non compare nulla, e
 * l'utente deve avere ancora la sua strada.
 *
 * Il `deviceId` del telefono non e' una prop: arriva dal messaggio `ready`
 * del ponte, non dai dispositivi gia' in elenco ne' dedotto dalla piattaforma
 * — con due telefoni si indovinerebbe, e `install_id` non scende mai al
 * client. Finche' non arriva, il bottone "Cerca TV" resta disabilitato: senza
 * `deviceId` non c'e' consenso da registrare, e il perche' si dice a parole
 * invece di lasciare l'utente davanti a un bottone grigio e muto.
 *
 * **`ready` e' un messaggio di caricamento**, non un flusso: il guscio lo manda
 * alla fine del caricamento della WebView. A `/devices` pero' si arriva quasi
 * sempre con la navigazione soft dell'App Router, quindi questo componente
 * nasce *dopo* che i `ready` sono passati e non ne vedrebbe mai uno. Per questo
 * al montaggio si legge l'ultimo `ready` noto (`lastNativeReady`) **e** si
 * resta in ascolto dei successivi: il guscio ne rimanda uno ogni volta che il
 * `deviceId` cambia (primo abbinamento, cambio account).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  inNativeShell,
  lastNativeReady,
  onNativeMessage,
  postToNative,
} from "@/lib/native/bridge";
import type { MotivoTv, TvTrovata } from "@/lib/native/protocol";
import { claimPairedByConsent } from "./actions";

const MESSAGGI: Record<MotivoTv, string> = {
  rifiutato: "Sulla TV è stato scelto Annulla.",
  scaduto: "Nessuna risposta dalla TV. Riprova.",
  occupato: "La TV sta già rispondendo a un altro telefono.",
  rete: "Non riesco a parlare con la TV. Riprova.",
  permesso: "Zapp non può cercare sulla rete locale. Consentilo nelle impostazioni.",
};

type Stato = "fermo" | "cerco" | "collego";

export function CercaTv() {
  const [dentro, setDentro] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [nomeTelefono, setNomeTelefono] = useState("Telefono");
  const [stato, setStato] = useState<Stato>("fermo");
  const [tv, setTv] = useState<TvTrovata[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [fatto, setFatto] = useState<string | null>(null);

  /** Il timer che toglie l'indicatore "Cerco…": va spento allo smontaggio. */
  const timerRicerca = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `inNativeShell` tocca `window`: si guarda dopo il montaggio, non durante il
  // render del server, altrimenti l'HTML del server e quello del client
  // divergono.
  useEffect(() => setDentro(inNativeShell()), []);

  // L'ultimo `ready` gia' passato: e' l'unico modo di avere il `deviceId`
  // quando si arriva qui con la navigazione soft (vedi il commento in testa).
  useEffect(() => {
    const ready = lastNativeReady();
    if (!ready) return;
    if (ready.deviceId) setDeviceId(ready.deviceId);
    if (ready.deviceName) setNomeTelefono(ready.deviceName);
  }, []);

  // Smontaggio: si spegne quello che e' rimasto acceso nel nativo
  // (`MulticastLock` e sweep) e il timer dell'indicatore. Senza, chi lascia la
  // pagina entro gli otto secondi si porta dietro una ricerca viva.
  useEffect(() => {
    return () => {
      if (timerRicerca.current) clearTimeout(timerRicerca.current);
      postToNative({ type: "discoverTv", action: "stop" });
    };
  }, []);

  useEffect(() => {
    return onNativeMessage((msg) => {
      if (msg.type === "ready") {
        if (msg.deviceId) setDeviceId(msg.deviceId);
        if (msg.deviceName) setNomeTelefono(msg.deviceName);
        return;
      }
      if (msg.type === "tvFound") {
        setTv(msg.devices);
        return;
      }
      if (msg.type === "tvError") {
        setStato("fermo");
        setErrore(MESSAGGI[msg.motivo]);
        return;
      }
      if (msg.type === "tvConsent") {
        void (async () => {
          if (!deviceId) return;
          const esito = await claimPairedByConsent(msg.installId, deviceId);
          setStato("fermo");
          if (esito.ok) {
            setFatto(esito.name);
            setErrore(null);
            // Abbinato: non c'e' piu' niente da cercare. Si spegne subito il
            // nativo invece di aspettare gli otto secondi del suo timeout.
            postToNative({ type: "discoverTv", action: "stop" });
          } else {
            setErrore(esito.error);
          }
        })();
      }
    });
  }, [deviceId]);

  const cerca = useCallback(() => {
    setErrore(null);
    setFatto(null);
    setTv([]);
    setStato("cerco");
    postToNative({ type: "discoverTv", action: "start" });
    // Il nativo si ferma da solo dopo otto secondi: qui si toglie solo
    // l'indicatore, senza spegnere niente due volte.
    if (timerRicerca.current) clearTimeout(timerRicerca.current);
    timerRicerca.current = setTimeout(
      () => setStato((s) => (s === "cerco" ? "fermo" : s)),
      8000,
    );
  }, []);

  const collega = useCallback(
    (scelta: TvTrovata) => {
      if (scelta.kind !== "zapp" || scelta.port === undefined || !deviceId) return;
      setErrore(null);
      setStato("collego");
      postToNative({
        type: "connectTv",
        host: scelta.host,
        port: scelta.port,
        name: nomeTelefono,
        deviceId,
      });
    },
    [deviceId, nomeTelefono],
  );

  if (!dentro) return null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <span className="text-[15px] font-semibold">TV vicine</span>
      <span className="text-[13px] text-muted">
        Apri Zapp sulla TV, poi tocca il suo nome: niente codice da digitare.
      </span>

      <span>
        <Button
          variant="secondary"
          disabled={stato !== "fermo" || !deviceId}
          className="h-12 px-5 text-[15px]"
          onClick={cerca}
        >
          {stato === "cerco" ? "Cerco…" : "Cerca TV"}
        </Button>
      </span>

      {!deviceId && (
        <p className="text-[13px] text-muted">
          Questo telefono non è ancora registrato in Zapp: riapri l’app, poi torna qui.
          Intanto puoi usare il codice qui sotto.
        </p>
      )}

      {fatto && <p className="text-[13px] text-accent-pale">Collegato a {fatto}.</p>}
      {errore && <p className="text-[13px] text-danger">{errore}</p>}

      {tv.length > 0 && (
        <ul className="flex flex-col gap-2">
          {tv.map((t) => (
            <li key={t.host}>
              {t.kind === "zapp" ? (
                <button
                  type="button"
                  onClick={() => collega(t)}
                  disabled={stato === "collego"}
                  className="flex w-full flex-col gap-0.5 rounded-2xl bg-surface-2 px-4 py-3 text-left disabled:opacity-50"
                >
                  <span className="text-[15px] font-semibold">{t.name}</span>
                  <span className="text-[13px] text-muted">
                    {stato === "collego" ? "Conferma sulla TV…" : "Tocca per collegare"}
                  </span>
                </button>
              ) : (
                <span className="flex flex-col gap-0.5 rounded-2xl bg-surface-2 px-4 py-3">
                  <span className="text-[15px] font-semibold">{t.name}</span>
                  <span className="text-[13px] text-muted">
                    Apri Zapp sulla TV, oppure installala dall’Appstore.
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {stato === "fermo" && tv.length === 0 && !fatto && (
        <span className="text-[13px] text-muted">
          Nessuna TV trovata. Usa il codice qui sotto.
        </span>
      )}
    </Card>
  );
}

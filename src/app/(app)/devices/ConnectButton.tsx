"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { connectBrowser, firstEventSeen } from "./actions";

/** L'id dell'estensione pubblicata; in sviluppo, quello caricato a mano. */
const EXTENSION_ID = process.env.NEXT_PUBLIC_ZCONNECTION_EXTENSION_ID ?? "";
const STORE_URL = process.env.NEXT_PUBLIC_ZCONNECTION_STORE_URL ?? "";
/** Ogni quanto si richiede "è arrivato qualcosa?", e per quanto si insiste. */
const POLL_MS = 3000;
const POLL_MAX_MS = 3 * 60 * 1000;

type Stato =
  | { fase: "idle" }
  | { fase: "assente" }
  | { fase: "errore"; testo: string }
  | { fase: "attesa"; deviceId: string }
  | { fase: "scaduto"; deviceId: string }
  | { fase: "confermato"; titolo: string | null };

interface ChromeRuntime {
  sendMessage?: (id: string, msg: unknown, cb: () => void) => void;
  lastError?: { message?: string };
}

/**
 * Bottone che sa in che stato sei col collegamento all'estensione.
 * `chrome.runtime.sendMessage` verso un'estensione non installata (o
 * disattivata) fallisce con `chrome.runtime.lastError`: è l'unico modo per
 * distinguere "non c'è" da "c'è ma non risponde ancora".
 */
export function ConnectButton() {
  const [stato, setStato] = useState<Stato>({ fase: "idle" });
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // il polling si ferma da solo: alla conferma, allo scadere, o smontando
  useEffect(() => {
    if (stato.fase !== "attesa") return;
    const deviceId = stato.deviceId;
    const scadenza = Date.now() + POLL_MAX_MS;
    timer.current = setInterval(async () => {
      if (Date.now() > scadenza) {
        if (timer.current) clearInterval(timer.current);
        // il browser resta collegato: manca solo la conferma. Lo stato deve
        // dirlo, altrimenti la card continua a promettere una conferma che
        // non arriverà più senza che l'utente lo sappia.
        setStato({ fase: "scaduto", deviceId });
        return;
      }
      const res = await firstEventSeen(deviceId);
      if (res.seen) {
        if (timer.current) clearInterval(timer.current);
        setStato({ fase: "confermato", titolo: res.title });
      }
    }, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [stato]);

  function collega() {
    start(async () => {
      const runtime = (window as unknown as { chrome?: { runtime?: ChromeRuntime } })
        .chrome?.runtime;
      if (!EXTENSION_ID || !runtime?.sendMessage) {
        setStato({ fase: "assente" });
        return;
      }

      const res = await connectBrowser();
      if (!res.ok) {
        setStato({ fase: "errore", testo: res.error });
        return;
      }

      runtime.sendMessage(EXTENSION_ID, { type: "zapp-token", token: res.token }, () => {
        // l'estensione non c'è (o è disattivata): lastError è l'unico modo di saperlo
        if (runtime.lastError) {
          setStato({ fase: "assente" });
          return;
        }
        setStato({ fase: "attesa", deviceId: res.deviceId });
      });
    });
  }

  if (stato.fase === "assente") {
    return (
      <div className="flex flex-col gap-2">
        {STORE_URL ? (
          <a
            href={STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-accent inline-flex min-h-[54px] items-center justify-center rounded-full px-6 font-semibold"
          >
            Installa l&rsquo;estensione
          </a>
        ) : (
          <Link
            href="/devices#connection-install"
            className="glass-accent inline-flex min-h-[54px] items-center justify-center rounded-full px-6 font-semibold"
          >
            Segui la guida di installazione
          </Link>
        )}
        <p className="text-[13px] text-muted">
          Non l&rsquo;ho trovata in questo browser. Installala, poi torna qui.
        </p>
        <Button variant="secondary" onClick={collega} disabled={pending}>
          Riprova il collegamento
        </Button>
      </div>
    );
  }

  if (stato.fase === "attesa") {
    return (
      <div className="flex flex-col gap-2 rounded-[20px] border border-border bg-surface p-4">
        <p className="text-[15px] font-semibold">Browser collegato.</p>
        <p className="text-[13px] text-muted">
          Apri Netflix, Prime Video, NOW o Disney+ e avvia un film o episodio: la conferma
          apparirà qui.
        </p>
      </div>
    );
  }

  if (stato.fase === "scaduto") {
    return (
      <div className="flex flex-col gap-2 rounded-[20px] border border-border bg-surface p-4">
        <p className="text-[15px] font-semibold">Browser collegato.</p>
        <p className="text-[13px] text-muted">
          Non è ancora arrivata conferma. Il collegamento resta attivo: apri Netflix,
          Prime Video, NOW o Disney+, fai partire qualcosa e rimettiti in ascolto.
        </p>
        <Button
          variant="secondary"
          className="h-10 self-start px-4 text-[13px]"
          onClick={() => setStato({ fase: "attesa", deviceId: stato.deviceId })}
        >
          Rimettiti in ascolto
        </Button>
      </div>
    );
  }

  if (stato.fase === "confermato") {
    return (
      <div className="flex flex-col gap-2 rounded-[20px] border border-accent/25 bg-surface p-4">
        <p className="text-[15px] font-semibold">Funziona.</p>
        <p className="text-[13px] text-muted">
          {stato.titolo
            ? `Ho appena riconosciuto ${stato.titolo}.`
            : "Ho appena riconosciuto quello che stai guardando."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={collega} disabled={pending}>
        Collega questo browser
      </Button>
      {stato.fase === "errore" && (
        <p className="text-[13px] text-danger">{stato.testo}</p>
      )}
    </div>
  );
}

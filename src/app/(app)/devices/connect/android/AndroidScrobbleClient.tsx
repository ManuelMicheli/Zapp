"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { inNativeShell, onNativeMessage, postToNative } from "@/lib/native/bridge";

/** I tre passi, nell'ordine in cui succedono davvero. */
const PASSI = [
  "Tocca “Apri le impostazioni”.",
  "Nell'elenco che si apre trova Zapp e attivalo.",
  "Torna qui: lo stato si aggiorna da solo, senza ricaricare.",
];

/**
 * Attiva il riconoscimento automatico su Android: chiede al guscio di aprire
 * le impostazioni di sistema del listener delle notifiche e ascolta
 * `scrobbleStatus` per sapere se è concesso. Fuori dal guscio non c'è niente
 * da fare — non è nemmeno un bottone che non funzionerebbe.
 */
export function AndroidScrobbleClient() {
  const [nelGuscio, setNelGuscio] = useState<boolean | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    setNelGuscio(inNativeShell());
    if (!inNativeShell()) return;
    return onNativeMessage((m) => {
      if (m.type === "scrobbleStatus") setGranted(m.granted);
    });
  }, []);

  // Prima dell'effetto (server → primo render client) non si sa ancora se si
  // è nel guscio: si mostra il riquadro "fuori dal guscio", corretto per la
  // stragrande maggioranza di chi apre questo indirizzo da un browser.
  if (!nelGuscio) {
    return (
      <section className="rounded-[20px] border border-border bg-surface p-5">
        <p className="text-[14px] leading-relaxed text-muted">
          Apri questa pagina dall&rsquo;app Zapp per Android: fuori da lì non c&rsquo;è
          niente da attivare.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col rounded-[20px] border border-border bg-surface p-5">
      <Button
        onClick={() =>
          postToNative({ type: "openSettings", which: "notificationListener" })
        }
        className="self-start"
      >
        Apri le impostazioni
      </Button>

      <ol className="mt-4 flex flex-col gap-1 text-[13px] leading-relaxed text-muted">
        {PASSI.map((passo, i) => (
          <li key={passo} className="flex gap-2">
            <span aria-hidden="true" className="text-accent-soft">
              {i + 1}.
            </span>
            {passo}
          </li>
        ))}
      </ol>

      {granted === true && (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-[14px] font-semibold text-text">
            ✓ Attivo: Zapp riconosce cosa guardi
          </p>
          <Link
            href="/devices"
            className="mt-1.5 inline-block text-[13px] text-accent-soft"
          >
            Metti in pausa o scollega da Dispositivi
          </Link>
        </div>
      )}
    </section>
  );
}

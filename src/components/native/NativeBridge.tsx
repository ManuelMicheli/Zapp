"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { pairOwnDevice } from "@/app/(app)/devices/actions";
import { inNativeShell, onNativeMessage, postToNative } from "@/lib/native/bridge";

/**
 * Il ponte con il guscio nativo, montato una volta sola nel layout di `(app)`.
 * Non disegna niente: sta in ascolto dei messaggi del guscio finché la pagina
 * vive. Fuori dal guscio (browser normale, PWA) non fa assolutamente nulla.
 *
 * L'abbinamento è il motivo per cui sta dentro `(app)`: lì la sessione c'è già,
 * quindi `pairOwnDevice` sa per chi è il dispositivo senza chiedere niente
 * all'utente. Il token che torna non si conserva da questa parte — né in
 * memoria né in `localStorage`: va al guscio e basta.
 */
export function NativeBridge() {
  const router = useRouter();
  /**
   * L'`installId` già abbinato in questa vita di pagina. Il guscio manda
   * `ready` **due volte** per caricamento (subito e dopo 1,5 s, perché il
   * primo può arrivare prima che React sia in ascolto): è normale, ma un
   * abbinamento per `ready` sarebbe una rotazione di token per `ready`, e le
   * due risposte possono tornare in ordine invertito lasciando al guscio un
   * token già invalidato. Un abbinamento per pagina, e basta.
   */
  const abbinato = useRef<string | null>(null);

  useEffect(() => {
    if (!inNativeShell()) return;

    return onNativeMessage((m) => {
      switch (m.type) {
        case "ready": {
          if (m.installId === abbinato.current) return;
          // La bandiera si alza **prima** dell'await: il secondo `ready`
          // arriva spesso mentre l'azione è ancora in volo.
          abbinato.current = m.installId;
          // Il nome vero arriva dal guscio (`expo-device`); il ripiego serve
          // solo se il sistema non lo dà. Vale comunque alla prima
          // installazione: un riabbinamento non riscrive `name`.
          const name =
            m.deviceName ?? (m.platform === "ios" ? "iPhone" : "Telefono Android");
          void pairOwnDevice({
            platform: m.platform,
            installId: m.installId,
            name,
          }).then((esito) => {
            if (esito.ok) {
              postToNative({
                type: "deviceToken",
                token: esito.token,
                deviceId: esito.deviceId,
              });
            } else {
              // Fallito: si riapre la porta, così il `ready` successivo
              // (secondo invio, o ricaricamento) può riprovare.
              abbinato.current = null;
              console.warn("[native] abbinamento", esito.error);
            }
          });
          break;
        }
        case "deepLink":
          // il percorso è già stato validato dal parser (interno, niente schema)
          router.push(m.path);
          break;
        case "pushToken":
        case "sharedContent":
          // fase 1 (push) / fase 2 (condivisione da altre app): per ora si
          // annota soltanto che il guscio li manda già.
          console.info("[native]", m.type);
          break;
      }
    });
  }, [router]);

  return null;
}

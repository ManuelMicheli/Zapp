"use client";

import { useEffect } from "react";
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
 * memoria né in `localStorage`: va al guscio e basta. L'azione è idempotente
 * sull'`installId` e ha il suo rate limit, quindi rifarla a ogni avvio non
 * costa un dispositivo in più.
 */
export function NativeBridge() {
  const router = useRouter();

  useEffect(() => {
    if (!inNativeShell()) return;

    return onNativeMessage((m) => {
      switch (m.type) {
        case "ready": {
          // Un nome provvisorio e riconoscibile: quello vero lo darà l'utente
          // da /devices, e da lì in poi il riabbinamento non lo sovrascrive
          // con questo (lo sovrascrive, per ora: è un limite noto).
          const name = m.platform === "ios" ? "iPhone" : "Telefono Android";
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

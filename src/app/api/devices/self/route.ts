import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/devices/auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Revoca del dispositivo che chiama: l'app nativa la invoca all'uscita
 * dall'account, quando il token che ha in mano non deve piu' valere.
 *
 * La riga `devices` **non si cancella**: `watch_sessions` e `pending_scrobbles`
 * la referenziano, e la cronologia di chi ha guardato cosa non va persa perche'
 * qualcuno esce dall'account. Basta `revoked_at`, che e' esattamente cio' che fa
 * `disconnectDevice` dalla pagina Dispositivi.
 */
export async function DELETE(request: Request) {
  const auth = await authenticateDevice(request, "device-self");
  if (!auth.ok) return auth.response;

  const service = createServiceClient();
  const deviceId = auth.device.deviceId;

  // L'ordine conta: prima la revoca, poi la pulizia. Se si pulisse per primo e
  // la revoca fallisse, il token resterebbe valido con i dati gia' tolti.
  const { error: revokeError } = await service
    .from("devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", deviceId);
  if (revokeError) {
    console.error("[devices/self] revoca", revokeError.message);
    return NextResponse.json(
      { error: "Servizio temporaneamente non disponibile" },
      { status: 503 },
    );
  }

  // Da qui in poi il dispositivo e' gia' fuori: un errore sulla pulizia si
  // scrive nei log ma non si racconta al chiamante, che ha ottenuto cio' che
  // chiedeva. Rispondergli 503 lo farebbe ritentare all'infinito su un token
  // ormai revocato — e il secondo tentativo prenderebbe 401.
  const { error: membersError } = await service
    .from("device_members")
    .delete()
    .eq("device_id", deviceId);
  if (membersError) {
    console.error("[devices/self] pulizia membri", membersError.message);
  }

  const { error: tokensError } = await service
    .from("push_tokens")
    .delete()
    .eq("device_id", deviceId);
  if (tokensError) {
    console.error("[devices/self] pulizia token push", tokensError.message);
  }

  return new NextResponse(null, { status: 204 });
}

import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/devices/auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Registrazione e revoca del token push di Expo per un dispositivo collegato.
 *
 * Si autentica col token del dispositivo (`Authorization: Bearer`), non col
 * cookie di sessione: chiama solo l'app nativa, quindi niente CORS e niente
 * preflight da gestire. La tabella `push_tokens` non e' leggibile ne'
 * scrivibile da `authenticated` (migration `0047_push.sql`): si passa dal
 * service client.
 */

const MAX_BODY = 2 * 1024;

/** `ExponentPushToken[...]` (o la forma nuova `ExpoPushToken[...]`). */
const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,200}\]$/;

export async function POST(request: Request) {
  const auth = await authenticateDevice(request, "push-token");
  if (!auth.ok) return auth.response;

  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  // `JSON.parse` non lancia su `null`, un numero o un array: sono JSON validi
  // senza i campi che servono. Si controlla la forma prima di leggerli.
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  // `in` invece di un `as`: su un `object` restringe il campo a `unknown`, che
  // e' esattamente cio' che e' — dato non fidato, da controllare a mano.
  const expoToken = "expoToken" in payload ? payload.expoToken : null;
  const platform = "platform" in payload ? payload.platform : null;
  if (typeof expoToken !== "string" || !EXPO_TOKEN.test(expoToken)) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  // Chiave di conflitto il token Expo, non il dispositivo: lo stesso token puo'
  // migrare da un'installazione all'altra (ripristino di un backup), e due righe
  // con lo stesso token farebbero arrivare la notifica due volte.
  const { error } = await createServiceClient().from("push_tokens").upsert(
    {
      expo_token: expoToken,
      device_id: auth.device.deviceId,
      platform,
      updated_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "expo_token" },
  );
  if (error) {
    console.error("[devices/push-token] upsert", error.message);
    return NextResponse.json(
      { error: "Servizio temporaneamente non disponibile" },
      { status: 503 },
    );
  }

  return new NextResponse(null, { status: 204 });
}

/** Uscita dall'account o notifiche spente: il dispositivo non riceve piu'. */
export async function DELETE(request: Request) {
  const auth = await authenticateDevice(request, "push-token");
  if (!auth.ok) return auth.response;

  const { error } = await createServiceClient()
    .from("push_tokens")
    .delete()
    .eq("device_id", auth.device.deviceId);
  if (error) {
    console.error("[devices/push-token] delete", error.message);
    return NextResponse.json(
      { error: "Servizio temporaneamente non disponibile" },
      { status: 503 },
    );
  }

  return new NextResponse(null, { status: 204 });
}

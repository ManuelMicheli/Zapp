import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { parseCorpoConsenso } from "@/lib/devices/consent";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

/** La risposta riguarda un abbinamento in corso: mai in cache. */
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * La TV dice al server che l'utente, col telecomando, ha autorizzato un
 * telefono ad abbinarla.
 *
 * Si autentica col **proprio** token di abbinamento, lo stesso del poll: senza,
 * chiunque conoscesse un codice a sei cifre potrebbe regalare una TV a un
 * dispositivo qualsiasi. Il telefono, subito dopo, reclama con la propria
 * sessione: e' quella la prova, non il `phone_device_id` che passa in chiaro
 * sulla rete locale.
 */
export async function POST(request: NextRequest) {
  const corpo = parseCorpoConsenso(await request.json().catch(() => null));
  if (!corpo) {
    return NextResponse.json(
      { error: "richiesta non valida" },
      { status: 400, headers: NO_STORE },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length < 20) {
    return NextResponse.json(
      { error: "non autorizzato" },
      { status: 401, headers: NO_STORE },
    );
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  if (!(await rateLimit(`pair-consent:${tokenHash}`, 10, 60))) {
    return NextResponse.json(
      { error: "troppe richieste" },
      { status: 429, headers: NO_STORE },
    );
  }

  const service = createServiceClient();
  const { data: riga, error } = await service
    .from("pairing_codes")
    .select("install_id, token_hash, expires_at")
    .eq("code", corpo.code)
    .maybeSingle();

  if (error) {
    console.error("pair-consent: lettura fallita", error);
    return NextResponse.json(
      { error: "errore interno" },
      { status: 500, headers: NO_STORE },
    );
  }

  // Riga assente e hash diverso danno la stessa risposta: un 404 direbbe a uno
  // sconosciuto che quel codice esiste.
  if (!riga || riga.token_hash !== tokenHash) {
    return NextResponse.json(
      { error: "non autorizzato" },
      { status: 401, headers: NO_STORE },
    );
  }

  // Il codice ruota ogni dieci minuti e il rinnovo cancella la riga: un consenso
  // che arriva a cavallo del rinnovo cade qui. La TV mostra "Riprova" e non si
  // tenta di spostarlo sulla riga nuova — sposterebbe un'autorizzazione da un
  // codice a un altro, cioe' proprio cio' che il consenso deve impedire.
  if (new Date(riga.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "codice scaduto" },
      { status: 410, headers: NO_STORE },
    );
  }

  const { data: telefono } = await service
    .from("devices")
    .select("id")
    .eq("id", corpo.phoneDeviceId)
    .in("platform", ["ios", "android"])
    .maybeSingle();
  if (!telefono) {
    return NextResponse.json(
      { error: "richiesta non valida" },
      { status: 400, headers: NO_STORE },
    );
  }

  const { error: errUpd } = await service
    .from("pairing_codes")
    .update({ consent_device_id: telefono.id })
    .eq("code", corpo.code)
    .eq("token_hash", tokenHash);
  if (errUpd) {
    console.error("pair-consent: update fallita", errUpd);
    return NextResponse.json(
      { error: "errore interno" },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ install_id: riga.install_id }, { headers: NO_STORE });
}

export const dynamic = "force-dynamic";

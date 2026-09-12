import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { isCodiceValido } from "@/lib/devices/pairing";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { coniaSessione } from "@/lib/tv/session";

/** La risposta porta token quando il codice e' reclamato: mai in cache. */
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * La TV chiede se qualcuno ha reclamato il suo codice.
 *
 * Si autentica col proprio token: senza, chiunque conoscesse un codice a sei
 * cifre saprebbe a chi appartiene la TV.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isCodiceValido(code)) {
    return NextResponse.json(
      { error: "codice non valido" },
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

  if (!(await rateLimit(`pair-poll:${tokenHash}`, 120, 60))) {
    return NextResponse.json(
      { error: "troppe richieste" },
      { status: 429, headers: NO_STORE },
    );
  }

  const service = createServiceClient();
  const { data: riga, error } = await service
    .from("pairing_codes")
    .select("claimed_by, install_id, token_hash")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("pair-poll: lettura fallita", error);
    return NextResponse.json(
      { error: "errore interno" },
      { status: 500, headers: NO_STORE },
    );
  }
  if (!riga || riga.token_hash !== tokenHash) {
    return NextResponse.json(
      { error: "non autorizzato" },
      { status: 401, headers: NO_STORE },
    );
  }
  if (!riga.claimed_by) {
    return NextResponse.json({ status: "pending" }, { headers: NO_STORE });
  }

  // Si prende la riga in un colpo solo: la cancellazione con `select` e' atomica,
  // quindi due poll sovrapposti non coniano due sessioni, e il codice sparisce
  // prima che esista un token. Se il conio fallisce (o manca il dispositivo) la
  // riga torna al suo posto.
  const { data: presa, error: errPresa } = await service
    .from("pairing_codes")
    .delete()
    .eq("code", code)
    .eq("token_hash", tokenHash)
    .not("claimed_by", "is", null)
    .select("*")
    .maybeSingle();
  if (errPresa) {
    console.error("pair-poll: presa fallita", errPresa.code);
    return NextResponse.json(
      { error: "errore interno" },
      { status: 500, headers: NO_STORE },
    );
  }
  if (!presa || !presa.claimed_by) {
    // Un altro poll l'ha gia' presa nel frattempo, o non era piu' reclamata.
    return NextResponse.json({ status: "pending" }, { headers: NO_STORE });
  }

  const { data: device } = await service
    .from("devices")
    .select("id")
    .eq("install_id", presa.install_id)
    .maybeSingle();

  if (!device) {
    const { error: errReinserimento } = await service.from("pairing_codes").insert(presa);
    if (errReinserimento) {
      console.error("pair-poll: reinserimento fallito", errReinserimento.code);
    }
    return NextResponse.json({ status: "pending" }, { headers: NO_STORE });
  }

  const [{ data: profilo }, session] = await Promise.all([
    service
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("id", presa.claimed_by)
      .maybeSingle(),
    coniaSessione(presa.claimed_by),
  ]);

  if (!session) {
    // Il reclamo e' avvenuto ma la sessione non si conia: si ripristina il
    // codice cosi' la TV puo' riprovare al poll successivo, finche' non scade.
    const { error: errReinserimento } = await service.from("pairing_codes").insert(presa);
    if (errReinserimento) {
      console.error("pair-poll: reinserimento fallito", errReinserimento.code);
    }
    return NextResponse.json(
      { error: "errore interno" },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    {
      status: "claimed",
      device_id: device.id,
      user: profilo
        ? { id: profilo.id, username: profilo.username, avatar_url: profilo.avatar_url }
        : { id: presa.claimed_by, username: null, avatar_url: null },
      session,
    },
    { headers: NO_STORE },
  );
}

export const dynamic = "force-dynamic";

import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { isCodiceValido } from "@/lib/devices/pairing";
import { rateLimit } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { coniaSessione } from "@/lib/tv/session";

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
    return NextResponse.json({ error: "codice non valido" }, { status: 400 });
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token.length < 20) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  if (!(await rateLimit(`pair-poll:${tokenHash}`, 120, 60))) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }

  const service = createServiceClient();
  const { data: riga, error } = await service
    .from("pairing_codes")
    .select("claimed_by, install_id, token_hash")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("pair-poll: lettura fallita", error);
    return NextResponse.json({ error: "errore interno" }, { status: 500 });
  }
  if (!riga || riga.token_hash !== tokenHash) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  if (!riga.claimed_by) return NextResponse.json({ status: "pending" });

  const { data: device } = await service
    .from("devices")
    .select("id")
    .eq("install_id", riga.install_id)
    .maybeSingle();

  if (!device) return NextResponse.json({ status: "pending" });

  const [{ data: profilo }, session] = await Promise.all([
    service
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("id", riga.claimed_by)
      .maybeSingle(),
    coniaSessione(riga.claimed_by),
  ]);

  if (!session) {
    // Il reclamo e' avvenuto ma la sessione non si conia: la TV riprova al poll
    // successivo, il codice resta finche' non scade.
    return NextResponse.json({ error: "errore interno" }, { status: 500 });
  }

  // Consegnata una volta sola: da qui il codice non si ripesca.
  await service.from("pairing_codes").delete().eq("code", code);

  return NextResponse.json({
    status: "claimed",
    device_id: device.id,
    user: profilo
      ? { id: profilo.id, username: profilo.username, avatar_url: profilo.avatar_url }
      : { id: riga.claimed_by, username: null, avatar_url: null },
    session,
  });
}

export const dynamic = "force-dynamic";

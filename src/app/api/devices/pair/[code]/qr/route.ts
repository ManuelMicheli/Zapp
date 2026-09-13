import { type NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { isCodiceValido } from "@/lib/devices/pairing";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Il QR del codice di abbinamento: lo inquadri col telefono invece di digitare
 * sei cifre.
 *
 * Non espone niente — dentro c'e' `/devices?code=NNNNNN`, cioe' lo stesso
 * numero che la TV scrive a schermo — ma e' pubblica (chi la chiama e' il
 * televisore, che una sessione non ce l'ha) e **disegna un PNG a ogni
 * richiesta**, senza cache. E' l'unica rotta del giro in cui una richiesta
 * costa lavoro di calcolo e nessuno la conta: il tetto per indirizzo la chiude.
 * Trenta al minuto stanno larghe anche a chi riprova, e a un ciclo impazzito
 * no.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isCodiceValido(code)) {
    return NextResponse.json({ error: "codice non valido" }, { status: 400 });
  }
  const indirizzo = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (indirizzo && !(await rateLimit(`pair-qr:${indirizzo}`, 30, 60))) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const png = await QRCode.toBuffer(`${base}/devices?code=${code}`, {
    width: 240,
    margin: 1,
  });
  return new NextResponse(new Uint8Array(png), {
    headers: { "content-type": "image/png", "cache-control": "no-store" },
  });
}

export const dynamic = "force-dynamic";

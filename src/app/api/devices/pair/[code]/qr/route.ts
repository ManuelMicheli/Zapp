import { type NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { isCodiceValido } from "@/lib/devices/pairing";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isCodiceValido(code)) {
    return NextResponse.json({ error: "codice non valido" }, { status: 400 });
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

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { tvJson } from "@/lib/tv/bearer";
import { rinnovaSessione } from "@/lib/tv/session";

/** Senza bearer: e' la rotta che serve quando il bearer e' scaduto. */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const refreshToken = (corpo as { refresh_token?: unknown } | null)?.refresh_token;
  if (
    typeof refreshToken !== "string" ||
    refreshToken.length < 20 ||
    refreshToken.length > 500
  ) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  const chiave = createHash("sha256").update(refreshToken).digest("hex").slice(0, 32);
  if (!(await rateLimit(`tv-refresh:${chiave}`, 10, 60))) {
    return tvJson({ error: "Troppe richieste" }, { status: 429 });
  }
  const session = await rinnovaSessione(refreshToken);
  if (!session) return tvJson({ error: "Non autenticato" }, { status: 401 });
  return tvJson({ session });
}

export const dynamic = "force-dynamic";

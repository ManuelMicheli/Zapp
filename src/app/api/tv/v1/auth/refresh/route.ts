import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { tvJson } from "@/lib/tv/bearer";
import type { Session } from "@/lib/tv/dto";
import { rinnovaSessione } from "@/lib/tv/session";

/** Senza bearer: e' la rotta che serve quando il bearer e' scaduto. */
export async function POST(request: NextRequest) {
  const corpo = await request.json().catch(() => null);
  const refreshToken = (corpo as { refresh_token?: unknown } | null)?.refresh_token;
  // Il refresh token di Supabase è una stringa opaca e corta (circa 12 caratteri),
  // diverso dal JWT access token. Il controllo di lunghezza è ampio per essere futuro-proof.
  if (
    typeof refreshToken !== "string" ||
    refreshToken.length < 8 ||
    refreshToken.length > 500
  ) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }

  // Il tetto qui sotto e' per il token, che lo sceglie il chiamante: un token nuovo
  // a ogni richiesta non lo incontrerebbe mai. Questa rotta non ha bearer (e' quella
  // che serve *quando* il bearer e' scaduto), quindi e' anche per indirizzo, come
  // `/devices/pair`.
  const indirizzo = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  if (
    indirizzo &&
    !(await rateLimit(`tv-refresh-ip:${indirizzo}`, 20, 60, { condiviso: true }))
  ) {
    return tvJson({ error: "Troppe richieste" }, { status: 429 });
  }

  const chiave = createHash("sha256").update(refreshToken).digest("hex").slice(0, 32);
  if (!(await rateLimit(`tv-refresh:${chiave}`, 10, 60))) {
    return tvJson({ error: "Troppe richieste" }, { status: 429 });
  }
  const session = await rinnovaSessione(refreshToken);
  if (!session) return tvJson({ error: "Non autenticato" }, { status: 401 });
  const body: { session: Session } = { session };
  return tvJson(body);
}

export const dynamic = "force-dynamic";

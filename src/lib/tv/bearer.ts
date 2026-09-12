import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { createBearerClient } from "@/lib/supabase/server";
import { runWithBearer, type BearerContext } from "@/lib/supabase/request-session";
import { parseBearer, parseDeviceId, TV_DEVICE_HEADER } from "./headers";

/** Risposta JSON delle rotte TV: mai in cache, mai condivisa. */
export function tvJson(body: unknown, init: ResponseInit = {}): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...(init.headers ?? {}) },
  });
}

/** Tetto per utente: una TV che sfoglia fa poche richieste al secondo, non trecento al minuto. */
const LIMITE_PER_MINUTO = 300;

/**
 * Autentica una richiesta dell'app TV e corre `handler` con la sessione nel
 * contesto (`createClient()`/`getViewer()` la vedono).
 *
 * Tre controlli, nell'ordine in cui costano meno:
 * 1. firma del JWT in locale (`getClaims(token)`: JWKS in cache, zero viaggi);
 * 2. tetto di frequenza per utente;
 * 3. il dispositivo dichiarato esiste e l'utente ne e' membro: e' questo che rende
 *    efficace la revoca da `/devices` anche se il refresh token della TV e' ancora
 *    valido (spec §4.1 punto 8). Con RLS, un membro vede solo le proprie righe di
 *    `device_members`: "nessuna riga" copre sia "revocato" sia "non tuo".
 */
export async function withBearer(
  request: NextRequest,
  handler: (ctx: BearerContext) => Promise<Response>,
): Promise<Response> {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return tvJson({ error: "Non autenticato" }, { status: 401 });

  const deviceId = parseDeviceId(request.headers.get(TV_DEVICE_HEADER));
  if (!deviceId) return tvJson({ error: "Dispositivo mancante" }, { status: 400 });

  const supabase = createBearerClient(token);
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || typeof data?.claims?.sub !== "string") {
    return tvJson({ error: "Non autenticato" }, { status: 401 });
  }
  const sub = data.claims.sub;

  if (!(await rateLimit(`tv:${sub}`, LIMITE_PER_MINUTO, 60))) {
    return tvJson({ error: "Troppe richieste" }, { status: 429 });
  }

  const { data: membro, error: errMembro } = await supabase
    .from("device_members")
    .select("device_id")
    .eq("device_id", deviceId)
    .eq("user_id", sub)
    .maybeSingle();
  if (errMembro) {
    console.error("[tv] device_members", errMembro.code);
    return tvJson({ error: "Non è riuscito, riprova." }, { status: 500 });
  }
  if (!membro) return tvJson({ error: "device_revoked" }, { status: 410 });

  const ctx: BearerContext = {
    accessToken: token,
    userId: sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    deviceId,
  };
  return runWithBearer(ctx, () => handler(ctx));
}

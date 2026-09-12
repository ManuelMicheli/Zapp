import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Autenticazione delle richieste che arrivano dal guscio nativo (Zapp Mobile) e
 * piu' in generale da un dispositivo collegato: `Authorization: Bearer <token>`,
 * dove il server conserva solo `sha256(token)` in `devices.token_hash`.
 *
 * `src/app/api/scrobble/route.ts` ha ancora la **sua copia inline** di questa
 * stessa cascata (stesso ordine, limite piu' alto): non e' una svista, quel file
 * e' in lavorazione in altre sessioni e riscriverlo adesso vorrebbe dire un
 * conflitto per ogni riga. Va unificato su questo modulo quando quel file sara'
 * fermo.
 *
 * Nessuna funzione qui dentro scrive mai il token o il suo hash nei log: un log
 * e' un posto dove una credenziale non deve finire nemmeno in forma derivata.
 */

export type DeviceAuth = { deviceId: string; tokenHash: string };

/**
 * Autentica una richiesta del guscio nativo con `Authorization: Bearer <token dispositivo>`.
 * `scope` distingue i rate limit per rotta (es. "push-token").
 */
export async function authenticateDevice(
  request: Request,
  scope: string,
): Promise<{ ok: true; device: DeviceAuth } | { ok: false; response: Response }> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  // I token del collegamento sono `zc_` + casuale: sotto i 20 caratteri non e'
  // uno di loro, e non vale una lettura sul database.
  if (!token || token.length < 20) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }),
    };
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Il limite e' per dispositivo (l'hash, non il token): un guscio impazzito
  // rallenta solo se stesso.
  if (!(await rateLimit(`${scope}:${tokenHash}`, 120, 60))) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Troppe richieste" }, { status: 429 }),
    };
  }

  const { data: device, error } = await createServiceClient()
    .from("devices")
    .select("id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    console.error("[devices/auth] lettura dispositivo", error.message);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Servizio temporaneamente non disponibile" },
        { status: 503 },
      ),
    };
  }
  // Nessuna riga = token sconosciuto **o** dispositivo revocato: al chiamante
  // si dice la stessa cosa, non quale dei due.
  if (!device) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }),
    };
  }

  return { ok: true, device: { deviceId: device.id, tokenHash } };
}

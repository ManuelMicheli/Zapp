import { NextResponse } from "next/server";
import { parseEventsBody } from "@/lib/taste/events";
import { rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lotti per utente in cinque minuti: 40 × 5 s coprono più di tre minuti di scroll. */
const LIMITE = 40;
const FINESTRA_S = 300;

/**
 * La telemetria della fase A.
 *
 * È un route handler e non una Server Action di proposito: non deve rivalidare nessuna
 * pagina né rigirare i cookie di sessione a ogni lotto, e viene chiamata anche da
 * `navigator.sendBeacon`, che una Server Action non sa invocare.
 *
 * Non sta in `PUBLIC_PATHS` del middleware — al contrario di `/api/jobs`: qui la
 * sessione a cookie *è* l'autenticazione, ed è l'unico modo di sapere di chi è
 * l'evento.
 *
 * Risponde **sempre** 204, anche quando scarta: il client non deve mai avere un motivo
 * per riprovare, e la telemetria non deve mai poter disturbare l'app.
 */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 204 });

  if (!(await rateLimit(`events:${user.id}`, LIMITE, FINESTRA_S))) {
    return new NextResponse(null, { status: 204 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const body = parseEventsBody(raw);
  if (!body) return new NextResponse(null, { status: 204 });

  // Spento = non si scrive niente. Il controllo sta anche qui, non solo nel client:
  // il client si può aggirare, la rotta no.
  const { data: pref } = await supabase
    .from("user_preferences")
    .select("personalization_enabled")
    .eq("user_id", user.id)
    .maybeSingle();
  if (pref && !pref.personalization_enabled) {
    return new NextResponse(null, { status: 204 });
  }

  const righe = body.events.map((e) => ({
    user_id: user.id,
    kind: e.kind,
    title_id: e.titleId,
    media_type: e.mediaType,
    surface: e.surface,
    position: e.position,
    session_id: body.sessionId,
    created_at: e.at,
  }));

  // `ignoreDuplicates` sull'indice unico parziale delle impression: una copertina
  // rivista nella stessa sessione non scrive una seconda riga.
  const { error } = await supabase
    .from("user_events")
    .upsert(righe, { ignoreDuplicates: true });
  if (error) console.error("[events] scrittura fallita:", error.message);

  return new NextResponse(null, { status: 204 });
}

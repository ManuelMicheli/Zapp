import type { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";
import { tvJson, withBearer } from "@/lib/tv/bearer";

const ESITI = ["ok", "assente", "errore"] as const;

/** Com'e' andata secondo la TV: senza, un lancio fallito sarebbe muto. */
export async function POST(request: NextRequest) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !isUuid(b.commandId) || !ESITI.includes(b.result as (typeof ESITI)[number])) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  return withBearer(request, async (ctx) => {
    // Service client: `0048_device_commands_solo_dal_server.sql` ha tolto l'update ad
    // `authenticated`. Il filtro `device_id` sotto resta l'unico controllo di proprieta'
    // su questa scrittura.
    const supabase = createServiceClient();
    const { data: riga, error } = await supabase
      .from("device_commands")
      .update({ result: b.result as string })
      .eq("id", b.commandId as string)
      .eq("device_id", ctx.deviceId)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[tv] play/result", error.code);
      return tvJson({ error: "Non è riuscito, riprova." }, { status: 500 });
    }
    if (!riga) return tvJson({ error: "Comando non trovato" }, { status: 404 });
    return tvJson({ ok: true });
  });
}

export const dynamic = "force-dynamic";

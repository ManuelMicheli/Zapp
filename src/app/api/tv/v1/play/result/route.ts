import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
    const supabase = await createClient();
    const { error } = await supabase
      .from("device_commands")
      .update({ result: b.result as string })
      .eq("id", b.commandId as string)
      .eq("device_id", ctx.deviceId);
    if (error) {
      console.error("[tv] play/result", error.code);
      return tvJson({ error: "Non è riuscito, riprova." }, { status: 500 });
    }
    return tvJson({ ok: true });
  });
}

export const dynamic = "force-dynamic";

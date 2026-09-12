import type { NextRequest } from "next/server";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { chiudiSessione } from "@/lib/tv/session";

export async function POST(request: NextRequest) {
  return withBearer(request, async (ctx) => {
    const chiusa = await chiudiSessione(ctx.accessToken);
    if (!chiusa) {
      return tvJson({ error: "Non è riuscito, riprova." }, { status: 500 });
    }
    return tvJson({ ok: true });
  });
}

export const dynamic = "force-dynamic";

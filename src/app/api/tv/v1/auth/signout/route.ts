import type { NextRequest } from "next/server";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { chiudiSessione } from "@/lib/tv/session";

export async function POST(request: NextRequest) {
  return withBearer(request, async (ctx) => {
    await chiudiSessione(ctx.accessToken);
    return tvJson({ ok: true });
  });
}

export const dynamic = "force-dynamic";

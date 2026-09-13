import type { NextRequest } from "next/server";
import { isMediaType, isTmdbId } from "@/lib/validate";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { loadTitleDetail } from "@/lib/tv/title";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> },
) {
  const { type, id } = await params;
  const numId = Number(id);
  if (!isMediaType(type) || !isTmdbId(numId)) {
    return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  }
  return withBearer(request, async () => {
    const detail = await loadTitleDetail(numId, type);
    if (!detail) return tvJson({ error: "Titolo non trovato" }, { status: 404 });
    return tvJson(detail);
  });
}

export const dynamic = "force-dynamic";

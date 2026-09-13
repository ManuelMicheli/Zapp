import type { NextRequest } from "next/server";
import { getLibraryPage } from "@/lib/watch/queries";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import { cardFromLibrary } from "@/lib/tv/map";
import { parseLibraryParams } from "@/lib/tv/library-params";

export async function GET(request: NextRequest) {
  const p = parseLibraryParams(request.nextUrl.searchParams);
  return withBearer(request, async () => {
    const page = await getLibraryPage(p.status, p.mediaType, p.offset, p.limit);
    return tvJson({ items: page.items.map(cardFromLibrary), total: page.total });
  });
}

export const dynamic = "force-dynamic";

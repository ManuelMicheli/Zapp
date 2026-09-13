import type { NextRequest } from "next/server";
import { getProviderList } from "@/lib/tmdb/client";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import type { ProvidersResponse } from "@/lib/tv/dto";

/** Catalogo piattaforme IT (nome, logo): la TV lo tiene in memoria per le pillole. */
export async function GET(request: NextRequest) {
  return withBearer(request, async () => {
    const lista = await getProviderList().catch(() => []);
    const body: ProvidersResponse = {
      providers: lista.map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        logoPath: p.logo_path ?? null,
      })),
    };
    return tvJson(body);
  });
}

export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { proxyGet } from "@/lib/tmdb/client";
import { createClient } from "@/lib/supabase/server";

export const revalidate = 300;

// Percorsi TMDB consentiti dal proxy (solo lettura, solo questi prefissi)
const ALLOWED = [
  /^search\/multi$/,
  /^trending\/(all|movie|tv)\/(day|week)$/,
  /^movie\/\d+(\/(watch\/providers|external_ids|credits|videos|recommendations))?$/,
  /^tv\/\d+(\/(watch\/providers|external_ids|credits|videos|recommendations))?$/,
  /^tv\/\d+\/season\/\d+$/,
  /^discover\/(movie|tv)$/,
  /^genre\/(movie|tv)\/list$/,
];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { path } = await context.params;
  const tmdbPath = path.join("/");

  if (!ALLOWED.some((re) => re.test(tmdbPath))) {
    return NextResponse.json({ error: "Percorso non consentito" }, { status: 400 });
  }

  const params: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    if (key !== "api_key" && key !== "language") params[key] = value;
  });

  try {
    const data = await proxyGet(tmdbPath, params);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/tmdb] errore:", error);
    return NextResponse.json({ error: "Errore TMDB" }, { status: 502 });
  }
}

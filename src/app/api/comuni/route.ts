import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { comuneLabel, searchComuni } from "@/lib/cinema/comuni";

/**
 * Suggerimenti mentre si scrive il posto: gli 7.904 comuni italiani con la sigla della
 * provincia ("Ossona, MI"). Elenco statico in memoria: nessuna chiamata esterna, nessun
 * limite da rispettare, risposta immediata a ogni tasto.
 */
export async function GET(request: NextRequest) {
  const user = await getViewer();
  if (!user) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q")?.slice(0, 80) ?? "";
  const results = searchComuni(q).map((c) => ({
    name: c.name,
    sigla: c.sigla,
    label: comuneLabel(c),
  }));
  return NextResponse.json({ results });
}

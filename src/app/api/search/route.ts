import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { instantSearch } from "@/lib/search/instant";

/**
 * Ricerca istantanea della pagina web `/search`. La logica vera e' in
 * `instantSearch` (condivisa con `/api/tv/v1/search`); qui restano solo
 * l'autenticazione e la forma della risposta che la pagina si aspetta.
 */
export async function GET(request: NextRequest) {
  const user = await getViewer();
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    return NextResponse.json(
      { results: await instantSearch(query) },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    console.error("[api/search] errore:", error);
    return NextResponse.json({ error: "Errore di ricerca" }, { status: 502 });
  }
}

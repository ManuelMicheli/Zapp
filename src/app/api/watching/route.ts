import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getLiveSessions } from "@/lib/watch/live";
import { getFriendsLive } from "@/lib/watch/social-live";
import { isUuid } from "@/lib/validate";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Cosa i dispositivi collegati stanno riproducendo adesso per chi chiede.
 *
 * Serve alla fila "Continua a guardare": il minutaggio deve scorrere e l'ordine
 * cambiare mentre si guarda su Netflix, cioè mentre **fuori** da Zapp succede
 * qualcosa che la pagina, resa dal server, non può sapere. La alternativa
 * sarebbe rifare la home a intervalli, che vuol dire rirenderizzare carosello,
 * scaffali e sezioni cinema per aggiornare due numeri: qui la richiesta è una
 * query sola e il client rifà la pagina **solo quando cambia davvero** cosa si
 * sta guardando.
 *
 * Non è in `PUBLIC_PATHS`: la sessione a cookie è l'autenticazione, come per
 * `/api/events`. Mai in cache — è la definizione di "adesso".
 */
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json(
      { error: "Non autenticato" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const headers = { "Cache-Control": "private, no-store" };
  const friendId = new URL(request.url).searchParams.get("friend");
  if (friendId !== null && !isUuid(friendId))
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400, headers });
  if (!(await rateLimit(`watching:${viewer.id}`, 60, 60)))
    return NextResponse.json({ error: "Riprova tra poco" }, { status: 429, headers });
  try {
    const [sessions, friends] = await Promise.all([
      friendId ? Promise.resolve([]) : getLiveSessions(),
      getFriendsLive(friendId ?? undefined),
    ]);
    return NextResponse.json({ sessions, friends, serverNow: Date.now() }, { headers });
  } catch (error) {
    console.error("[watching] aggiornamento", error);
    return NextResponse.json(
      { error: "Aggiornamento non disponibile" },
      { status: 503, headers },
    );
  }
}

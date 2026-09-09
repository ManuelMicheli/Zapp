import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { getLiveSessions } from "@/lib/watch/live";

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
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json(
      { error: "Non autenticato" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const sessions = await getLiveSessions();
  return NextResponse.json({ sessions }, { headers: { "Cache-Control": "no-store" } });
}

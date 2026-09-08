import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { moodByKey } from "@/lib/moment/recipes";
import { getMomentShelf, type MomentResponse } from "@/lib/moment/shelf";
import { rateLimit } from "@/lib/rate-limit";

/**
 * I titoli di un mood, chiesti **su tocco** e non a ogni visita: rendere le sei
 * varianti lato server come fa `HomeType` sarebbe sei `discover` per tipo a ogni
 * apertura della home, per una riga che quasi nessuno tocca.
 *
 * Come ogni rotta, gli argomenti li scrive chiunque abbia una sessione: `mood` si
 * confronta con l'elenco chiuso delle ricette e non finisce mai dentro una query.
 */

export async function GET(request: Request) {
  const user = await getViewer();
  if (!user) {
    return NextResponse.json({ error: "Accesso richiesto" }, { status: 401 });
  }
  if (!(await rateLimit(`moment:${user.id}`, 30, 60))) {
    return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
  }

  const mood = moodByKey(new URL(request.url).searchParams.get("mood"));
  if (!mood) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  try {
    const data = await getMomentShelf(mood);
    return NextResponse.json({ titolo: mood.titolo, data } satisfies MomentResponse);
  } catch (error) {
    // Il dettaglio resta nei log: verso il client va sempre un messaggio generico.
    console.error("[moment] errore nel calcolo della fila", error);
    return NextResponse.json({ error: "Riprova fra poco" }, { status: 500 });
  }
}

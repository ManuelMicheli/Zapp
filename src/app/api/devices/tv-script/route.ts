import { type NextRequest, NextResponse } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { rateLimit } from "@/lib/rate-limit";
import {
  ASCOLTATORI,
  eIndirizzoPrivato,
  normalizzaIp,
  type AppTv,
  type Sistema,
} from "@/lib/devices/listeners";
import { nomeFile, scriptTv, tipoFile } from "@/lib/devices/tv-script";

/**
 * Il file che `/devices/connect/tv` fa scaricare: dentro ci sono gia'
 * l'indirizzo della TV e il servizio da abilitare.
 *
 * Tutto quello che finisce nel file e' validato qui, non ripulito: l'IP deve
 * essere un IPv4 **di rete locale** (uno pubblico vorrebbe dire mandare qualcuno
 * a bussare su un computer altrui) e l'app deve essere una delle nostre. Serve
 * una sessione: e' materiale per chi ha gia' un account e una TV da collegare,
 * non un generatore di script aperto al mondo.
 */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "non autorizzato" }, { status: 401 });
  }
  if (!(await rateLimit(`tv-script:${viewer.id}`, 20, 60))) {
    return NextResponse.json({ error: "troppe richieste" }, { status: 429 });
  }

  const params = request.nextUrl.searchParams;
  const ip = normalizzaIp(params.get("ip") ?? "");
  if (ip === null || !eIndirizzoPrivato(ip)) {
    return NextResponse.json({ error: "indirizzo non valido" }, { status: 400 });
  }

  const app = params.get("app") ?? "";
  if (!Object.hasOwn(ASCOLTATORI, app)) {
    return NextResponse.json({ error: "app sconosciuta" }, { status: 400 });
  }

  const os = params.get("os") === "unix" ? "unix" : "windows";
  const sistema: Sistema = os;

  return new NextResponse(scriptTv(sistema, ip, app as AppTv), {
    headers: {
      "Content-Type": tipoFile(sistema),
      "Content-Disposition": `attachment; filename="${nomeFile(sistema)}"`,
      // Il file porta dentro l'indirizzo di una TV: non deve restare in nessuna
      // cache intermedia, e la TV successiva avra' un altro indirizzo.
      "Cache-Control": "no-store",
    },
  });
}

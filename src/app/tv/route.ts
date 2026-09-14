import { NextResponse } from "next/server";

/**
 * L'indirizzo da digitare col telecomando: `zapp-mu.vercel.app/tv`.
 *
 * Su una Fire TV l'app si installa con *Downloader*, che chiede un indirizzo e
 * lo fa scrivere lettera per lettera su una tastiera a griglia. Il nome vero del
 * pacchetto sono quaranta caratteri e un numero di versione che cambia: qui c'e'
 * un indirizzo di tre lettere che non cambiera' mai, e la versione la decide
 * questa riga.
 *
 * Dal 14/09/2026 punta a **Zapp TV**, l'app intera (home, scheda, libreria,
 * ricerca, Play sulle piattaforme) che comprende anche l'ascolto che faceva
 * ZConnection TV: quella resta scaricabile solo per nome
 * (`/downloads/zconnection-tv-0.2.apk`) per chi ce l'ha gia' installata.
 */
const PACCHETTO = "/downloads/zapp-tv-0.1.apk";

export function GET(request: Request) {
  return NextResponse.redirect(new URL(PACCHETTO, request.url), 302);
}

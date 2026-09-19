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
 *
 * La 0.2 (19/09/2026) scende a `minSdk 22` ed e' firmata **anche v1**: la 0.1
 * dichiarava API 25 e portava la sola firma v2, e sugli stick Fire OS 5 non si
 * installava — "errore parse", visto su una TV vera. Non c'e' piu' un
 * televisore Fire da cui Zapp sia esclusa.
 */
const PACCHETTO = "/downloads/zapp-tv-0.2.apk";

export function GET(request: Request) {
  return NextResponse.redirect(new URL(PACCHETTO, request.url), 302);
}

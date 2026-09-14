import { NextResponse } from "next/server";

/**
 * L'indirizzo da digitare col telecomando: `zapp-mu.vercel.app/tv`.
 *
 * Su una Fire TV l'app si installa con *Downloader*, che chiede un indirizzo e
 * lo fa scrivere lettera per lettera su una tastiera a griglia. Il nome vero del
 * pacchetto (`/downloads/zconnection-tv-0.2.apk`) sono quaranta caratteri e un
 * numero di versione che cambia: qui c'e' un indirizzo di tre lettere che non
 * cambiera' mai, e la versione la decide questa riga.
 */
const PACCHETTO = "/downloads/zconnection-tv-0.2.apk";

export function GET(request: Request) {
  return NextResponse.redirect(new URL(PACCHETTO, request.url), 302);
}

import type { NextRequest } from "next/server";
import {
  addWant,
  dropTitle,
  markWatched,
  removeEntry,
  setProgress,
  setRating,
  startWatching,
  type ActionResult,
} from "@/lib/watch/actions";
import { tvJson, withBearer } from "@/lib/tv/bearer";
import type { WatchResult } from "@/lib/tv/dto";
import { parseWatchBody, toWatchResult, type WatchBody } from "@/lib/tv/watch-body";

/**
 * Le stesse Server Action della scheda web, chiamate come funzioni: leggono
 * l'utente da `getViewer()`, che dentro `withBearer` e' quello del token.
 */
async function esegui(b: WatchBody): Promise<ActionResult> {
  switch (b.action) {
    case "want":
      return addWant(b.titleId, b.mediaType);
    case "watching":
      return startWatching(b.titleId, b.mediaType);
    case "watched":
      return markWatched(b.titleId, b.mediaType);
    case "drop":
      return dropTitle(b.titleId, b.mediaType);
    case "remove":
      return removeEntry(b.titleId, b.mediaType);
    case "episode":
      return setProgress(b.titleId, b.season!, b.episode!);
    case "rate":
      return setRating(b.titleId, b.mediaType, b.rating!);
  }
}

export async function POST(request: NextRequest) {
  const body = parseWatchBody(await request.json().catch(() => null));
  if (!body) return tvJson({ error: "Richiesta non valida" }, { status: 400 });
  return withBearer(request, async () => {
    const esito = await esegui(body);
    const risultato: WatchResult = toWatchResult(esito);
    return tvJson(risultato, { status: risultato.ok ? 200 : 400 });
  });
}

export const dynamic = "force-dynamic";

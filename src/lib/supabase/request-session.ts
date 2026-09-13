import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Sessione portata da un header `Authorization: Bearer` (app TV), non dai cookie.
 * Vive per la durata di una richiesta dentro `withBearer` (`src/lib/tv/bearer.ts`):
 * `createClient()` e `getViewer()` la leggono da qui, cosi' le query e le action del
 * sito servono la TV senza sapere da dove arriva l'utente.
 */
export interface BearerContext {
  accessToken: string;
  userId: string;
  email: string | null;
  /** Dispositivo dichiarato dalla TV, gia' verificato come suo membro. */
  deviceId: string;
}

const store = new AsyncLocalStorage<BearerContext>();

export function bearerContext(): BearerContext | undefined {
  return store.getStore();
}

export function runWithBearer<T>(ctx: BearerContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

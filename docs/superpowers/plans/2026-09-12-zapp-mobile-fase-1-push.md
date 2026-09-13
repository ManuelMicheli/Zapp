# Zapp Mobile — Fase 1: notifiche push. Piano di esecuzione

> **Per gli agenti esecutori:** SUB-SKILL RICHIESTA: superpowers:subagent-driven-development.
**Spec:** docs/superpowers/specs/2026-09-12-zapp-mobile-design.md (§1.4, §1.2, §1.3, §2). Piano generale: docs/superpowers/plans/2026-09-12-zapp-mobile-fase-0.md §3, §5.

**Obiettivo:** una notifica push arriva sul telefono, ad app chiusa, quando succede qualcosa che Zapp gia' scrive in `notifications` (amicizia, accettata, consiglio, commento, like, moderazione) e ogni mattina per la domanda del giorno; il tap apre la pagina giusta.

**Architettura (adeguata ai fatti del codice, 2026-09-12):** le notifiche nascono solo da trigger SQL, quindi il fan-out parte da un trigger `after insert on notifications` che chiama `call_zapp_job('push-send')` (pg_net, come i cron) e il job scarica le righe con `pushed_at is null`; cron di riserva ogni 5 minuti. La domanda del giorno non ha eventi: job `push-daily` la mattina. `ambiguous_user` non esiste ancora (fase 3): **fuori dalla fase 1**. Invio via Expo Push API (`https://exp.host/--/api/v2/push/send`), ricevute dopo 15 minuti (`push-receipts`), `DeviceNotRegistered` cancella il token. Il guscio registra il token con `Authorization: Bearer <token dispositivo>` su `POST /api/devices/push-token`, dopo l'abbinamento; il tap manda `deepLink` alla pagina.

**Vincoli globali:** quelli della spec §2. In piu': rotte bearer sotto `/api/devices/*` in `PUBLIC_PATHS`; helper condiviso `src/lib/devices/auth.ts` (la rotta scrobble resta com'e': altre sessioni la toccano); Vitest solo su funzioni pure; migrazione = `0047_push.sql`; nessun testo di notifica inventato: titolo/corpo derivano dallo `switch` di `src/app/(app)/notifications/page.tsx`.

## Task (ordine: 1.1 → 1.2 → 1.3 in sequenza nel worktree Zapp; 1.4 in parallelo dopo 1.2 nel repo mobile; 1.5 in coda)

### 1.1 (Sonnet) — Migration 0047: `push_tokens`, `push_tickets`, `notifications.pushed_at`, trigger, cron
### 1.2 (Opus) — `src/lib/devices/auth.ts` + rotte `POST/DELETE /api/devices/push-token`, `DELETE /api/devices/self`, `PUBLIC_PATHS`
### 1.3 (Opus) — `src/lib/push/{compose,tickets}.ts` (puri + Vitest), `expo.ts`, `fanout.ts`, job `push-send`/`push-receipts`/`push-daily`
### 1.4 (Opus) — ZappMobile: `src/native/push.ts`, registrazione dopo l'abbinamento, tap → deepLink, `signedOut` → cancella token
### 1.5 (Sonnet) — docs (`mobile.md`, `social.md` una riga, `.env.example`), gate di fase

I brief completi di ogni task stanno nel workspace SDD (`.superpowers/sdd/fase-1-push/task-1.N-brief.md`) durante l'esecuzione; le interfacce vincolanti sono ripetute qui sotto.

## Interfacce vincolanti

```ts
// src/lib/devices/auth.ts (server-only)
export type DeviceAuth = { deviceId: string; tokenHash: string };
export async function authenticateDevice(request: Request, scope: string):
  Promise<{ ok: true; device: DeviceAuth } | { ok: false; response: Response }>;
// 401 senza token o token corto, 429 oltre rateLimit(`${scope}:${tokenHash}`, 120, 60), 503 errore DB, 401 se revocato/inesistente

// POST /api/devices/push-token  body {"expoToken": "ExponentPushToken[...]", "platform": "ios"|"android"}
//   → 204 (upsert per expo_token, aggiorna device_id/platform/updated_at); 400 se non valido
// DELETE /api/devices/push-token  → 204 (cancella i token di questo device)
// DELETE /api/devices/self  → 204 (revoca: revoked_at=now, cancella device_members e push_tokens)

// src/lib/push/compose.ts (puro)
export type PushMessage = { title: string; body: string; path: string };
export function composePush(kind: string, payload: Record<string, unknown>, nomi: { fromUser?: string; titolo?: string }): PushMessage | null;
// null = tipo che non si spinge (si marca pushed_at comunque)

// src/lib/push/tickets.ts (puro)
export function chunk<T>(items: T[], size: number): T[][];              // Expo: 100 per richiesta
export function parseTickets(risposta: unknown, inviati: { tokenId: string }[]): { ticketId: string; tokenId: string }[] | { error: string };
export function tokensToDelete(ricevute: unknown): string[];           // ticket id con DeviceNotRegistered

// src/lib/push/expo.ts (server-only): sendExpoMessages(messaggi) / getExpoReceipts(ticketIds); header Authorization: Bearer EXPO_ACCESS_TOKEN se presente
// src/lib/push/fanout.ts (server-only): drainNotifications(): Promise<{ inviate: number; senzaToken: number }>; pushDailyQuestion(): Promise<{ inviate: number }>; processReceipts(): Promise<{ cancellati: number }>
```

## Verifica di fase
1. `pnpm test` (nuovi test compose/tickets), `pnpm typecheck && pnpm lint`, build isolata.
2. Con un token dispositivo di prova (riga `devices` creata a mano, come in `docs/architecture/mobile.md`): `POST /api/devices/push-token` con un token finto `ExponentPushToken[zzzz]` → 204; inserire una riga in `notifications` per quell'utente → il job `push-send` gira (`x-jobs-secret`) → Expo risponde con errore per il token finto → errore registrato, `pushed_at` valorizzato.
3. Sul telefono (dopo `eas build`): amicizia da un secondo account → notifica ad app chiusa → tap → `/friends`.

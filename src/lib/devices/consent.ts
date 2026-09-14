/**
 * Il corpo di `POST /api/devices/pair/consent`, validato campo per campo.
 *
 * Lo manda la **TV**, non il telefono: il `phone_device_id` glielo ha appena
 * passato il telefono sulla rete locale, quindi qui e' un dato di terzi e si
 * controlla come tale. Funzione pura: si prova con vitest.
 */

import { isCodiceValido } from "./pairing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CorpoConsenso = { code: string; phoneDeviceId: string };

export function parseCorpoConsenso(valore: unknown): CorpoConsenso | null {
  if (typeof valore !== "object" || valore === null || Array.isArray(valore)) return null;
  const msg = valore as Record<string, unknown>;
  if (!isCodiceValido(msg.code)) return null;
  const id = msg.phone_device_id;
  if (typeof id !== "string" || !UUID_RE.test(id)) return null;
  return { code: msg.code, phoneDeviceId: id };
}

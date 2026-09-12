import { isUuid } from "@/lib/validate";

/** Header con l'id del dispositivo: e' la revoca (spec §4.1 punto 8). */
export const TV_DEVICE_HEADER = "x-zapp-device";

/** Lunghezza minima di un token valido: sotto i 6 caratteri non e' accettabile. */
const TOKEN_MIN = 6;

export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = header.trim().match(/^Bearer\s+(\S+)$/i);
  if (!m || m[1].length < TOKEN_MIN) return null;
  return m[1];
}

export function parseDeviceId(header: string | null): string | null {
  if (!header) return null;
  const v = header.trim().toLowerCase();
  return isUuid(v) ? v : null;
}

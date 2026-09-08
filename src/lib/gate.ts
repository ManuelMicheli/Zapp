import "server-only";

/**
 * Freni che valgono per **tutta l'applicazione**, non per la singola istanza.
 *
 * Diversi da `rate-limit.ts`: li' si limita un utente perche' non abusi
 * dell'app; qui si limita l'app intera perche' non abusi di qualcun altro.
 * Nominatim, per esempio, chiede al massimo una richiesta al secondo *per
 * applicazione*: un tetto per utente non lo rispetta appena ci sono due lambda,
 * e la conseguenza non e' un errore in pagina, e' il ban.
 *
 * Senza Upstash configurato non frenano niente e lo dicono tornando `true`: in
 * sviluppo c'e' una sola istanza e il throttle locale basta.
 */

function configurato(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

async function comandi(cmds: (string | number)[][]): Promise<unknown[]> {
  const res = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmds.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  return ((await res.json()) as { result: unknown }[]).map((r) => r.result);
}

/** Quante volte si riprova ad aspettare il proprio turno prima di rinunciare. */
const TENTATIVI = 4;

/**
 * Turno globale: al massimo `alSecondo` chiamate al secondo in tutta l'app.
 *
 * La chiave porta dentro il secondo corrente, quindi scade da sola e non c'e'
 * niente da ripulire. Costa due comandi per tentativo, ma il volume e'
 * bassissimo (un geocoding per utente ogni tanto).
 *
 * Se Upstash non risponde si passa lo stesso: bloccare la posizione dell'utente
 * perche' il limitatore e' irraggiungibile sarebbe il rimedio peggiore del male.
 */
export async function attendiTurno(nome: string, alSecondo: number): Promise<boolean> {
  if (!configurato()) return true;
  for (let i = 0; i < TENTATIVI; i += 1) {
    const secondo = Math.floor(Date.now() / 1000);
    try {
      const [n] = (await comandi([
        ["INCR", `gate:${nome}:${secondo}`],
        ["EXPIRE", `gate:${nome}:${secondo}`, 2, "NX"],
      ])) as [number];
      if (n <= alSecondo) return true;
    } catch {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1100));
  }
  return false;
}

/**
 * Posti contati: al massimo `max` occupanti insieme in tutta l'app.
 *
 * L'insieme ordinato tiene chi e' dentro e da quando; le voci piu' vecchie di
 * `ttlSec` cadono da sole, cosi' un import interrotto a meta' non tiene il
 * posto per sempre. Chi e' gia' dentro rientra sempre: il controllo e' sul
 * numero di occupanti diversi, non sul numero di chiamate.
 */
export async function prendiPosto(
  nome: string,
  chi: string,
  max: number,
  ttlSec: number,
): Promise<boolean> {
  if (!configurato()) return true;
  const ora = Date.now();
  try {
    const esiti = await comandi([
      ["ZREMRANGEBYSCORE", `posti:${nome}`, 0, ora - ttlSec * 1000],
      ["ZSCORE", `posti:${nome}`, chi],
      ["ZCARD", `posti:${nome}`],
    ]);
    const dentroGia = esiti[1] !== null && esiti[1] !== undefined;
    const occupati = Number(esiti[2] ?? 0);
    if (!dentroGia && occupati >= max) return false;
    await comandi([
      ["ZADD", `posti:${nome}`, ora, chi],
      ["EXPIRE", `posti:${nome}`, ttlSec * 2],
    ]);
    return true;
  } catch {
    return true;
  }
}

export async function lasciaPosto(nome: string, chi: string): Promise<void> {
  if (!configurato()) return;
  try {
    await comandi([["ZREM", `posti:${nome}`, chi]]);
  } catch {
    // Il posto scade da solo dopo il TTL: non vale la pena riprovare.
  }
}

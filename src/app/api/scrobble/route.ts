import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { rateLimit } from "@/lib/rate-limit";
import { decide } from "@/lib/scrobble/rules";
import { matchTitle } from "@/lib/scrobble/match";
import { PROVIDER_ID_BY_SITE, parseEvent } from "@/lib/scrobble/sites";
import type { RawEvent, Site } from "@/lib/scrobble/types";

/**
 * L'unica origine che puo' chiamare questo endpoint da fuori (l'estensione
 * browser). Vuota -> nessun header CORS, ma la rotta resta utilizzabile da
 * chi la chiama same-origin (nessuno, oggi: e' pensata per l'estensione).
 */
const EXTENSION_ORIGIN = process.env.ZCONNECTION_EXTENSION_ORIGIN ?? "";
const MAX_EVENTS = 50;
const MAX_BODY = 64 * 1024;
const SITES: Site[] = ["netflix", "prime", "disney", "now"];
const STATES = ["playing", "paused", "stopped"];
/**
 * Tetto per i sei campi di testo grezzo che finiscono dentro una query TMDB
 * e un `.ilike()` (`matchTitle`): `title`, `artist`, `album`, `titleText`,
 * `showText`, `pauseText`. Il tetto di `MAX_BODY` sul corpo intero non basta
 * da solo: un evento potrebbe restare piccolo nel complesso e avere comunque
 * un campo enorme. Un valore fuori misura scarta **l'intero evento** (non lo
 * tronca): un titolo troncato a meta' cercherebbe su TMDB qualcosa che non
 * esiste, con lo stesso costo di una ricerca legittima ma nessuna
 * possibilita' di match.
 *
 * **`url` non usa questo tetto** (vedi `MAX_URL_LEN` sotto): non e' uno dei
 * sei, ha un limite a se'.
 */
const MAX_FIELD_LEN = 500;

/**
 * Tetto solo per `url`, il convenzionale limite pratico di un URL (la
 * maggior parte dei browser/server tronca oltre gli ~2000 caratteri). Non
 * puo' condividere `MAX_FIELD_LEN`: misurato sugli URL veri della sonda
 * Netflix (`src/lib/scrobble/__fixtures__/netflix.json`), quello con
 * `tctx` (un blob di tracciamento codificato in base64/URL-encoding, a
 * lunghezza variabile) arriva a **375 caratteri** — con un tetto di 500 il
 * margine sarebbe di appena 125 caratteri su un valore che Netflix genera,
 * non l'estensione: una sessione con un `tctx` un po' piu' lungo farebbe
 * scartare ogni evento di quella pagina, in silenzio, senza che nessun test
 * lo riveli. La ragione per cui gli altri sei campi possono restare stretti
 * non vale per `url`: `title`/`artist`/`album`/`titleText`/`showText`/
 * `pauseText` finiscono in una query TMDB e in un `.ilike()` (dove un
 * valore anomalo e' un costo o un rischio reale), `url` invece va solo a
 * `siteFromUrl` (legge l'hostname) e `watchIdFromUrl` (una regex sul
 * percorso): non tocca mai ne' TMDB ne' il database, quindi stringerlo non
 * protegge niente e puo' solo rompere il caso reale sopra.
 */
const MAX_URL_LEN = 2000;

/**
 * `scrobble_apply` esiste nel database (migration 0035) ma e' volutamente
 * **non esposta**: la migrazione la revoca da `anon`, `authenticated` e
 * `public` ("la chiama solo il nostro server, col service role"). Il
 * generatore di `src/types/database.ts` elenca solo cio' che PostgREST
 * vedrebbe, quindi questa funzione non comparira' **mai** fra le `Functions`
 * generate — non e' un ritardo da recuperare al prossimo `supabase gen
 * types` (altre funzioni revocate allo stesso modo, es. `log_watch_activity`,
 * `notify_friendship`, non ci sono nemmeno loro). Interfaccia locale,
 * permanente, con la firma vera letta dalla migrazione:
 * `scrobble_apply(p_token_hash text, p_intent jsonb) returns jsonb`.
 */
interface ScrobbleApplyClient {
  rpc(
    fn: "scrobble_apply",
    args: { p_token_hash: string; p_intent: Record<string, unknown> },
  ): Promise<{
    data: { ok: boolean; reason?: string; entry_written?: boolean } | null;
    error: { message: string } | null;
  }>;
}

function cors(res: NextResponse): NextResponse {
  if (EXTENSION_ORIGIN) {
    // Origine fissa da env, mai quella della richiesta: niente riflessione.
    res.headers.set("Access-Control-Allow-Origin", EXTENSION_ORIGIN);
    res.headers.set("Access-Control-Allow-Headers", "content-type, authorization");
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

/**
 * Stringa entro `max` caratteri, oppure `null`. Parametrizzata apposta: i
 * campi che finiscono in TMDB/`.ilike()` chiamano con `MAX_FIELD_LEN`, `url`
 * (che non ci finisce mai, vedi `MAX_URL_LEN`) chiama con quello — un solo
 * tetto condiviso fra i due avrebbe scartato in silenzio gli URL reali di
 * Netflix, che arrivano a 375 caratteri col parametro `tctx`.
 */
function isBoundedStringOrNull(v: unknown, max: number): v is string | null {
  return v === null || (typeof v === "string" && v.length <= max);
}

/** Numero finito: esclude NaN, +-Infinity e qualunque tipo diverso da "number". */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Un evento grezzo utilizzabile. Oltre alla forma (`RawEvent` porta anche i
 * campi DOM di Netflix, `titleText`/`showText`/`pauseText`, letti cosi' come
 * sono: li valida solo come stringa/null, entro `MAX_FIELD_LEN` per i sei
 * campi che finiscono in TMDB/`.ilike()` e `MAX_URL_LEN` per `url` — vedi i
 * commenti sulle due costanti, il significato lo legge `parseEvent`), qui si
 * scarta un minutaggio assurdo — requisito che non sta nel brief:
 * `positionMs` puo' essere `null` (lo gestisce gia' `decide`, che lo traduce
 * in un `ignore`), ma se e' valorizzato dev'essere un numero finito >= 0;
 * `durationMs`, se non e' `null`, dev'essere un numero finito > 0 (zero
 * compreso fra gli scarti: una durata nulla non e' una durata sconosciuta).
 * Non c'e' un vincolo lato DB su queste colonne: la difesa e' solo qui.
 */
function isRawEvent(v: unknown): v is RawEvent {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  if (typeof e.id !== "string" || typeof e.at !== "string") return false;
  if (typeof e.site !== "string" || !SITES.includes(e.site as Site)) return false;
  if (typeof e.state !== "string" || !STATES.includes(e.state)) return false;
  if (!isBoundedStringOrNull(e.url, MAX_URL_LEN)) return false;
  if (
    !isBoundedStringOrNull(e.title, MAX_FIELD_LEN) ||
    !isBoundedStringOrNull(e.artist, MAX_FIELD_LEN) ||
    !isBoundedStringOrNull(e.album, MAX_FIELD_LEN)
  ) {
    return false;
  }
  if (
    !isBoundedStringOrNull(e.titleText, MAX_FIELD_LEN) ||
    !isBoundedStringOrNull(e.showText, MAX_FIELD_LEN)
  ) {
    return false;
  }
  if (!isBoundedStringOrNull(e.pauseText, MAX_FIELD_LEN)) return false;
  if (e.positionMs !== null && !(isFiniteNumber(e.positionMs) && e.positionMs >= 0)) {
    return false;
  }
  if (e.durationMs !== null && !(isFiniteNumber(e.durationMs) && e.durationMs > 0)) {
    return false;
  }
  return true;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.length < 20) {
    return cors(NextResponse.json({ error: "Non autorizzato" }, { status: 401 }));
  }
  const tokenHash = createHash("sha256").update(token).digest("hex");

  if (!(await rateLimit(`scrobble:${tokenHash}`, 240, 60))) {
    return cors(NextResponse.json({ error: "Troppe richieste" }, { status: 429 }));
  }

  const body = await request.text();
  if (body.length > MAX_BODY) {
    return cors(NextResponse.json({ error: "Richiesta troppo grande" }, { status: 413 }));
  }

  // `JSON.parse` non lancia su `null`, un numero, una stringa o un array: sono
  // tutti JSON validi, ma non hanno un campo `.events` da leggere. Senza
  // questo controllo `payload.events` esploderebbe su `payload === null`
  // (TypeError non gestito -> 500 fuori da `cors()`, che l'estensione, in
  // cross-origin, non riuscirebbe nemmeno a leggere).
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return cors(NextResponse.json({ error: "Richiesta non valida" }, { status: 400 }));
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return cors(NextResponse.json({ error: "Richiesta non valida" }, { status: 400 }));
  }

  const rawEvents = (payload as { events?: unknown }).events;
  const events = Array.isArray(rawEvents) ? rawEvents.slice(0, MAX_EVENTS) : [];
  const service = createServiceClient();

  // Serve l'id del dispositivo per leggere LA SUA sessione: senza, si leggerebbe
  // la sessione di chiunque altro stia guardando lo stesso titolo (requisito
  // del task, gia' nel brief: non va tolto).
  const { data: device } = await service
    .from("devices")
    .select("id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (!device) {
    return cors(NextResponse.json({ error: "Non autorizzato" }, { status: 401 }));
  }

  let applied = 0;
  let ignored = 0;
  let card: Record<string, unknown> | null = null;

  for (const raw of events) {
    if (!isRawEvent(raw)) {
      ignored++;
      continue;
    }

    // Fuori da /watch/ (anteprime del catalogo) o senza un titolo noto per
    // quell'id: `parseEvent` ritorna `null`, non un `kind: "unknown"` — la
    // vera firma diverge dal brief. Si scarta subito, prima di spendere una
    // ricerca TMDB per un'anteprima.
    const parsed = parseEvent(raw);
    if (!parsed) {
      ignored++;
      continue;
    }

    const providerId = PROVIDER_ID_BY_SITE[raw.site];
    const match = await matchTitle(parsed, providerId);
    if (!match) {
      ignored++;
      continue;
    }

    // la FK di watch_sessions/watch_entries esige la riga in `titles`; porta
    // anche titolo e copertina per la card, cosi' non serve una seconda lettura.
    const cachedTitle = await getOrFetchTitle(match.titleId, match.mediaType);
    if (!cachedTitle) {
      ignored++;
      continue;
    }

    const { data: prev } = await service
      .from("watch_sessions")
      .select("position_ms, duration_ms, last_heartbeat_at")
      .eq("device_id", device.id)
      .eq("title_id", match.titleId)
      .eq("media_type", match.mediaType)
      .is("ended_at", null)
      .order("last_heartbeat_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const intent = decide({
      previous: prev
        ? {
            positionMs: Number(prev.position_ms ?? 0),
            durationMs: prev.duration_ms === null ? null : Number(prev.duration_ms),
            lastAt: prev.last_heartbeat_at,
          }
        : null,
      state: raw.state,
      at: raw.at,
      positionMs: raw.positionMs,
      durationMs: raw.durationMs,
      closing: raw.state === "stopped",
    });

    if (intent.ignore) {
      ignored++;
      continue;
    }

    const { data, error } = await (service as unknown as ScrobbleApplyClient).rpc(
      "scrobble_apply",
      {
        p_token_hash: tokenHash,
        p_intent: {
          title_id: match.titleId,
          media_type: match.mediaType,
          provider_id: providerId,
          season: parsed.season,
          episode: parsed.episode,
          state: intent.session.state,
          position_ms: intent.session.positionMs,
          duration_ms: intent.session.durationMs,
          completed: intent.completed,
          progress: intent.progress
            ? {
                position_ms: intent.progress.positionMs,
                duration_ms: intent.progress.durationMs,
              }
            : null,
          at: raw.at,
        },
      },
    );

    if (error) {
      console.error("[scrobble] rpc", error.message);
      ignored++;
      continue;
    }
    if (data?.ok === false) {
      return cors(NextResponse.json({ error: "Non autorizzato" }, { status: 401 }));
    }

    // `ok: true` non basta: la RPC scrive sempre `watch_sessions` ma tocca
    // `watch_entries` solo se i membri attivi del dispositivo sono esattamente
    // uno (o se la guardia temporale sulla posizione lascia passare la riga).
    // Senza questo controllo `applied`/`card` scattavano anche a libreria
    // intatta, e il toast diceva "Segnato su Zapp" mentre non era vero.
    if (!data?.entry_written) {
      ignored++;
      continue;
    }

    applied++;

    // per la card dell'estensione: mai una chiamata TMDB dal client, i dati
    // vengono dalla stessa riga di cache appena letta/scritta sopra.
    card = {
      title: cachedTitle.title.title,
      posterPath: cachedTitle.title.poster_path,
      backdropPath: cachedTitle.title.backdrop_path,
      season: parsed.season,
      episode: parsed.episode,
      episodeName: parsed.episodeName,
      completed: intent.completed,
    };
  }

  return cors(NextResponse.json({ ok: true, applied, ignored, card }));
}

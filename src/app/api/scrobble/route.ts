import { disneyCatalogMatch, disneyKnownEpisode } from "@/lib/scrobble/providers/disney-catalog";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSeason, getTv } from "@/lib/tmdb/client";
import { resolvePrimeEpisode, samePrimeName } from "@/lib/scrobble/providers/prime-resolve";
import { primeTitleScore, primeTvConflict } from "@/lib/scrobble/providers/prime-title";
import { MATCH_THRESHOLD } from "@/lib/scrobble/rank";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { rateLimit } from "@/lib/rate-limit";
import { decide } from "@/lib/scrobble/rules";
import { matchTitle } from "@/lib/scrobble/match";
import { PROVIDER_ID_BY_SITE, parseEvent } from "@/lib/scrobble/sites";
import type { ParsedMedia, RawEvent, Site } from "@/lib/scrobble/types";

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
  if (
    typeof e.id !== "string" ||
    e.id.length > 100 ||
    typeof e.at !== "string" ||
    !Number.isFinite(Date.parse(e.at))
  )
    return false;
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
  if (
    e.contentKey !== undefined &&
    (typeof e.contentKey !== "string" || e.contentKey.length > 1500)
  )
    return false;
  if (
    e.playbackRate !== undefined &&
    !(isFiniteNumber(e.playbackRate) && e.playbackRate > 0 && e.playbackRate <= 16)
  )
    return false;
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
  const { data: device, error: deviceError } = await service
    .from("devices")
    .select("id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (deviceError)
    return cors(
      NextResponse.json(
        { error: "Servizio temporaneamente non disponibile" },
        { status: 503 },
      ),
    );
  if (!device) {
    return cors(NextResponse.json({ error: "Non autorizzato" }, { status: 401 }));
  }

  let applied = 0;
  let ignored = 0;
  /** Quanti eventi avevano un titolo leggibile che TMDB non ha saputo dare. */
  let nonRiconosciuti = 0;
  let card: Record<string, unknown> | null = null;
  let cardUrl: string | null = null;
  let cardContentKey: string | null = null;
  const acknowledged: string[] = [];

  for (const raw of events) {
    try {
      if (!isRawEvent(raw)) {
        if (raw && typeof raw.id === "string") acknowledged.push(raw.id);
        ignored++;
        continue;
      }

      // Fuori da /watch/ (anteprime del catalogo) o senza un titolo noto per
      // quell'id: `parseEvent` ritorna `null`, non un `kind: "unknown"` — la
      // vera firma diverge dal brief. Si scarta subito, prima di spendere una
      // ricerca TMDB per un'anteprima.
      const parsed = parseEvent(raw);
      if (!parsed) {
        acknowledged.push(raw.id);
        ignored++;
        continue;
      }

      const providerId = PROVIDER_ID_BY_SITE[raw.site];
      const disneyAlias = raw.site === "disney" ? disneyCatalogMatch(parsed) : null;
      const match = disneyAlias ?? await matchTitle(parsed, providerId);
      if (!match) {
        // Un titolo che non si riconosce va scritto da qualche parte, altrimenti
        // il guasto e' muto: l'utente vede l'episodio nel popup e non arriva mai
        // in libreria, e da fuori non si distingue da "non sta guardando".
        // `pending_scrobbles` esiste apposta (reason `unknown_title`) ed e' anche
        // la coda da cui la fase 3 fara' scegliere il titolo a mano.
        await annotaNonRiconosciuto(service, device.id, providerId, parsed);
        acknowledged.push(raw.id);
        nonRiconosciuti++;
        ignored++;
        continue;
      }

      // la FK di watch_sessions/watch_entries esige la riga in `titles`; porta
      // anche titolo e copertina per la card, cosi' non serve una seconda lettura.
      const cachedTitle = await getOrFetchTitle(match.titleId, match.mediaType, {
        requireFull: raw.site === "prime" || raw.site === "now" || raw.site === "disney",
      });
      if (!cachedTitle) {
        ignored++;
        continue;
      }

      if (raw.site === "prime" || raw.site === "now" || raw.site === "disney") {
        const title = cachedTitle.title;
        const titleScore = primeTitleScore(
          parsed.title,
          title.title,
          title.original_title,
        );
        let verified = raw.site === "now" || raw.site === "disney"
          ? samePrimeName(parsed.title, title.title) || (!!title.original_title && samePrimeName(parsed.title, title.original_title))
          : titleScore >= MATCH_THRESHOLD;
        if (disneyAlias?.titleId === match.titleId) verified = true;
        if (match.mediaType === "tv") {
          let episode =
            parsed.kind === "tv" && verified
              ? await resolvePrimeEpisode(parsed.episodeName, title.seasons, (season) =>
                  getSeason(match.titleId, season),
                )
              : null;
          if (!episode && raw.site === "disney" && verified) {
            const known = disneyKnownEpisode(parsed, match.titleId);
            if (known) {
              const season = await getSeason(match.titleId, known.season);
              const candidate = season.episodes.find(e => e.episode_number === known.episode && e.season_number === known.season);
              // Solo i nomi generici effettivamente mancanti in TMDB.
              if (candidate && /^(?:Episodio|Episode) \d+$/.test(candidate.name)) episode = known;
            }
          }
          verified = !!episode;
          if (episode) {
            parsed.season = episode.season;
            parsed.episode = episode.episode;
          }
        } else {
          verified = verified && parsed.kind === "movie";
          // Una serie veramente omonima resta ambigua. Un risultato TV soltanto
          // simile (Spider-Man rispetto a Spider-Man: Homecoming) non annulla
          // invece la corrispondenza del film gia' verificata sopra.
          if (verified) {
            const tvMatch = await matchTitle(
              { ...parsed, kind: "tv", season: 1 },
              providerId,
            );
            if (tvMatch) {
              const tvTitle = await getTv(tvMatch.titleId);
              verified = !primeTvConflict(
                titleScore,
                primeTitleScore(parsed.title, tvTitle.name, tvTitle.original_name),
              );
            }
          }
        }
        if (!verified) {
          await annotaNonRiconosciuto(service, device.id, providerId, parsed);
          acknowledged.push(raw.id);
          nonRiconosciuti++;
          ignored++;
          continue;
        }
      }

      // Le miniserie con una sola stagione non devono aspettare il pannello pausa.
      if (match.mediaType === "tv" && parsed.season === null && parsed.episode !== null) {
        const seasons = cachedTitle.title.seasons;
        if (Array.isArray(seasons)) {
          const regular = seasons.filter(
            (v): v is { season_number: number; episode_count: number } =>
              !!v &&
              typeof v === "object" &&
              !Array.isArray(v) &&
              typeof v.season_number === "number" &&
              v.season_number > 0 &&
              typeof v.episode_count === "number",
          );
          if (regular.length === 1 && parsed.episode <= regular[0].episode_count)
            parsed.season = regular[0].season_number;
        }
      }
      let previousQuery = service
        .from("watch_sessions")
        .select("position_ms, duration_ms, last_heartbeat_at")
        .eq("device_id", device.id)
        .eq("title_id", match.titleId)
        .eq("media_type", match.mediaType);
      if (raw.site === "prime" || raw.site === "now" || raw.site === "disney") {
        previousQuery = previousQuery.eq("provider_id", providerId);
        previousQuery =
          parsed.season === null
            ? previousQuery.is("season_number", null)
            : previousQuery.eq("season_number", parsed.season);
        previousQuery =
          parsed.episode === null
            ? previousQuery.is("episode_number", null)
            : previousQuery.eq("episode_number", parsed.episode);
      }
      const { data: prev, error: prevError } = await previousQuery
        .order("last_heartbeat_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevError) throw prevError;
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
        acknowledged.push(raw.id);
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
      if (!data) throw new Error("Nessuna conferma dalla RPC");
      if (data?.ok === false) {
        return cors(NextResponse.json({ error: "Non autorizzato" }, { status: 401 }));
      }

      acknowledged.push(raw.id);

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
      cardUrl = raw.url;
      cardContentKey = raw.contentKey ?? null;
      card = {
        title: cachedTitle.title.title,
        posterPath: cachedTitle.title.poster_path,
        backdropPath: cachedTitle.title.backdrop_path,
        season: parsed.season,
        episode: parsed.episode,
        episodeName: parsed.episodeName,
        completed: intent.completed,
      };
    } catch (error) {
      // Nessun ACK: l'estensione mantiene l'evento per un tentativo successivo.
      console.error("[scrobble] evento da ritentare", error);
      ignored++;
    }
  }

  return cors(
    NextResponse.json({
      ok: true,
      supportedSites: ["netflix", "prime", "now", "disney"],
      applied,
      ignored,
      nonRiconosciuti,
      card,
      cardUrl,
      cardContentKey,
      acknowledged,
    }),
  );
}

/**
 * Scrive in `pending_scrobbles` un titolo che il riconoscimento non ha saputo
 * associare, una volta sola per dispositivo e per titolo.
 *
 * La deduplica non e' un dettaglio: il battito e' ogni 30 secondi, quindi un
 * episodio non riconosciuto guardato per un'ora scriverebbe 120 righe identiche.
 * La chiave e' `ParsedMedia.key` (titolo + stagione + episodio + nome), che
 * `parseMedia` calcola gia'.
 *
 * `user_id` resta nullo: qui non sappiamo di chi sia — l'attribuzione la fa
 * `scrobble_apply`, che non viene chiamata proprio perche' non c'e' un titolo.
 * Un errore di scrittura non deve far cadere l'ingestione: e' diagnostica.
 */
async function annotaNonRiconosciuto(
  service: ReturnType<typeof createServiceClient>,
  deviceId: string,
  providerId: number,
  parsed: ParsedMedia,
): Promise<void> {
  try {
    const { data: gia } = await service
      .from("pending_scrobbles")
      .select("id")
      .eq("device_id", deviceId)
      .eq("reason", "unknown_title")
      .eq("raw->>key", parsed.key)
      .limit(1)
      .maybeSingle();
    if (gia) return;

    await service.from("pending_scrobbles").insert({
      device_id: deviceId,
      reason: "unknown_title",
      provider_id: providerId,
      raw: { ...parsed, provider_id: providerId },
    });
  } catch (err) {
    console.error("[scrobble] annota non riconosciuto", err);
  }
}

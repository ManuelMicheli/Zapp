import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/devices/auth";
import { soleActiveMember } from "@/lib/devices/member";
import { rateLimit } from "@/lib/rate-limit";
import { searchCandidates } from "@/lib/share/candidates";
import { chooseCandidate } from "@/lib/share/choose";
import { textQuery } from "@/lib/share/parse-shared";
import { isMediaType, isTmdbId } from "@/lib/validate";
import { applyWatch } from "@/lib/watch/core";
import type { WatchAction } from "@/lib/watch/patch";

/**
 * "Ehi Siri, ho visto Dark": la rotta che gli App Intents di iOS (e i Comandi
 * Rapidi) chiamano per segnare un titolo senza aprire l'app.
 *
 * Si autentica col **token del dispositivo** (`Authorization: Bearer`), come le
 * altre rotte del guscio nativo: nessun cookie di sessione, quindi nessuna
 * CORS da gestire e nessun preflight. Chi sia l'utente lo dice
 * `device_members`, non il token — e lo dice solo se il dispositivo ha **un**
 * membro attivo (`soleActiveMember`): su un telefono condiviso scrivere nella
 * libreria sbagliata sarebbe un danno silenzioso.
 *
 * Due forme di richiesta, non mescolabili:
 *
 * - `{ intent, query }` — la frase detta a Siri. Si passa da `textQuery`
 *   (lo stesso parser del foglio "Condividi": toglie cornici e anno) e dalla
 *   ricerca; se nessun candidato stacca gli altri si risponde `choose` con
 *   fino a 5 proposte, che l'intent mostra come elenco a chi ha parlato. Non
 *   si indovina: segnare "visto" il titolo sbagliato e' peggio di un tocco.
 * - `{ intent, titleId, mediaType }` — il titolo e' gia' stato scelto (il
 *   secondo giro dopo un `choose`, o un Comando Rapido costruito a mano).
 *
 * Nessun log porta mai il token ne' il testo della query: la frase detta a
 * Siri e' cronologia di visione di una persona, nei log ne resta al massimo la
 * lunghezza.
 */

const MAX_BODY = 2 * 1024;
/** Oltre questo non e' piu' il nome di un titolo detto a voce. */
const MAX_QUERY = 200;
/** Quante proposte tornano al massimo con `choose` (`chooseCandidate` ne da' 5). */
const MAX_OPTIONS = 5;

const AZIONI: Record<string, WatchAction> = {
  mark_watched: "watched",
  now_watching: "watching",
  want: "want",
};

function nonValida() {
  return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
}

function nonDisponibile() {
  return NextResponse.json(
    { error: "Servizio temporaneamente non disponibile" },
    { status: 503 },
  );
}

/**
 * Scrive la voce e invalida le pagine che la mostrano. `revalidatePath` sta
 * qui e non in `applyWatch`: quella e' una funzione di dominio, riusabile da
 * un job o da un test, e non deve sapere che esiste una cache di rotte.
 */
async function applica(
  userId: string,
  id: number,
  mediaType: "movie" | "tv",
  azione: WatchAction,
) {
  const esito = await applyWatch(userId, id, mediaType, azione);
  if (!esito.ok) {
    // Un id TMDB che non esiste non e' un guasto: per chi ha parlato e'
    // semplicemente "non l'ho trovato", la stessa risposta della ricerca a
    // vuoto.
    if (esito.error === "titolo_sconosciuto") {
      return NextResponse.json({ status: "none" });
    }
    return nonDisponibile();
  }

  revalidatePath("/");
  revalidatePath("/library");
  revalidatePath(`/title/${mediaType}/${id}`);

  return NextResponse.json({
    status: "done",
    id,
    mediaType,
    title: esito.title,
  });
}

export async function POST(request: Request) {
  const auth = await authenticateDevice(request, "intent");
  if (!auth.ok) return auth.response;

  const raw = await request.text();
  if (raw.length > MAX_BODY) return nonValida();

  // `JSON.parse` non lancia su `null`, un numero o un array: sono JSON validi
  // senza i campi che servono. Si controlla la forma prima di leggerli.
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return nonValida();
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return nonValida();
  }

  // `in` invece di un `as`: su un `object` restringe il campo a `unknown`, che
  // e' esattamente cio' che e' — dato non fidato, da controllare a mano.
  const intentRaw = "intent" in payload ? payload.intent : null;
  if (typeof intentRaw !== "string" || !(intentRaw in AZIONI)) return nonValida();
  const azione = AZIONI[intentRaw];

  const queryRaw = "query" in payload ? payload.query : null;
  const titleIdRaw = "titleId" in payload ? payload.titleId : null;
  const mediaTypeRaw = "mediaType" in payload ? payload.mediaType : null;

  // Le due forme non si mescolano: `query` presente vuol dire "cerca", e un
  // `titleId` accanto sarebbe solo un modo per non sapere quale delle due ha
  // deciso. Presente significa presente: anche `query: 42` e' un errore, non
  // un motivo per scendere sull'altra forma.
  //
  // La forma si controlla **prima** di interrogare il database: una richiesta
  // malformata non deve costare una query, e deve prendere 400 anche su un
  // dispositivo condiviso (che altrimenti risponderebbe 409 nascondendo
  // l'errore vero a chi sta costruendo il Comando Rapido).
  let query: string | null = null;
  let diretto: { id: number; mediaType: "movie" | "tv" } | null = null;
  if (queryRaw !== null && queryRaw !== undefined) {
    if (typeof queryRaw !== "string") return nonValida();
    const trimmed = queryRaw.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_QUERY) return nonValida();
    query = trimmed;
  } else {
    if (!isTmdbId(titleIdRaw) || !isMediaType(mediaTypeRaw)) return nonValida();
    diretto = { id: titleIdRaw, mediaType: mediaTypeRaw };
  }

  const membro = await soleActiveMember(auth.device.deviceId);
  if ("error" in membro) {
    if (membro.error === "db") return nonDisponibile();
    // Dispositivo di famiglia (piu' membri) o non ancora abbinato: la rotta
    // non sceglie per nessuno. Il messaggio non dice **quale** dei due casi
    // e' — a chi chiama serve sapere che deve aprire l'app, non chi altro
    // usa quel telefono.
    return NextResponse.json(
      { error: "dispositivo condiviso o senza utente" },
      { status: 409 },
    );
  }
  const userId = membro.userId;

  if (query !== null) {
    // La ricerca costa una chiamata a TMDB: il limite e' per utente e
    // **condiviso** fra le istanze, perche' quel che si protegge sta fuori di
    // qui (vedi `OpzioniLimite` in `rate-limit.ts`).
    if (!(await rateLimit(`intent-search:${userId}`, 20, 60, { condiviso: true }))) {
      return NextResponse.json({ error: "Troppe richieste" }, { status: 429 });
    }

    const parsed = textQuery(query);
    // Nessuna lettera: Siri ha capito un numero o un rumore, non un titolo.
    if (!parsed) return NextResponse.json({ status: "none" });

    let candidati;
    try {
      candidati = await searchCandidates(parsed.query);
    } catch {
      // Nei log la lunghezza, mai il testo: la frase e' cronologia di visione.
      console.error(`[devices/intent] ricerca fallita (query di ${query.length} car.)`);
      return nonDisponibile();
    }

    const { sure, shortlist } = chooseCandidate(parsed.query, parsed.year, candidati);
    if (sure) return applica(userId, sure.id, sure.mediaType, azione);
    if (shortlist.length === 0) return NextResponse.json({ status: "none" });

    return NextResponse.json({
      status: "choose",
      options: shortlist.slice(0, MAX_OPTIONS).map((c) => ({
        id: c.id,
        mediaType: c.mediaType,
        title: c.title,
        year: c.year,
      })),
    });
  }

  // `diretto` e' l'altro ramo del controllo qui sopra: se `query` e' nulla,
  // questo non lo e'.
  if (!diretto) return nonValida();
  return applica(userId, diretto.id, diretto.mediaType, azione);
}

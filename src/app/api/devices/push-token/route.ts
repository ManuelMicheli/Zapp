import { NextResponse } from "next/server";
import { authenticateDevice } from "@/lib/devices/auth";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Registrazione e revoca del token push di Expo per un dispositivo collegato.
 *
 * Si autentica col token del dispositivo (`Authorization: Bearer`), non col
 * cookie di sessione: chiama solo l'app nativa, quindi niente CORS e niente
 * preflight da gestire. La tabella `push_tokens` non e' leggibile ne'
 * scrivibile da `authenticated` (migration `0047_push.sql`): si passa dal
 * service client.
 */

const MAX_BODY = 2 * 1024;

/**
 * Il token e' gia' di un **altro** dispositivo che non condivide nemmeno un
 * utente con chi lo sta registrando? Due query piccole: la riga del token e i
 * membri dei due dispositivi. `"errore"` quando il database non risponde: in
 * dubbio non si lascia passare la registrazione.
 *
 * Due casi che **non** sono un conflitto, e che senza questi controlli
 * bloccavano per sempre la registrazione di quel telefono:
 *
 * - il token sta su un dispositivo **revocato** (chi l'aveva e' uscito
 *   dall'account, o l'ha scollegato da /devices): quella riga e' un residuo
 *   che non ricevera' mai piu' niente, non un account da proteggere;
 * - il dispositivo che ce l'ha non ha **nessun membro**: non e' di nessuno, e
 *   confrontare "utenti in comune" con un insieme vuoto dava sempre zero, cioe'
 *   sempre conflitto.
 */
async function tokenDiUnAltroAccount(
  supabase: ReturnType<typeof createServiceClient>,
  expoToken: string,
  deviceId: string,
): Promise<boolean | "errore"> {
  // Il filtro sul join `!inner` fa il lavoro del primo caso: se il dispositivo
  // che ha il token e' revocato, la riga non torna affatto e si finisce nel
  // ramo "nessuno ce l'ha" — che e' esattamente il verdetto giusto.
  const { data: esistente, error } = await supabase
    .from("push_tokens")
    .select("device_id, devices!inner(revoked_at)")
    .eq("expo_token", expoToken)
    .is("devices.revoked_at", null)
    .maybeSingle();
  if (error) {
    console.error("[devices/push-token] lettura token", error.message);
    return "errore";
  }
  // Nessuno ce l'ha (o ce l'ha un dispositivo revocato), o ce l'ha gia' questo
  // stesso dispositivo: niente da dire.
  if (!esistente || esistente.device_id === deviceId) return false;

  const { data: membri, error: erroreMembri } = await supabase
    .from("device_members")
    .select("device_id, user_id")
    .in("device_id", [deviceId, esistente.device_id]);
  if (erroreMembri) {
    console.error("[devices/push-token] membri", erroreMembri.message);
    return "errore";
  }
  const miei = new Set(
    (membri ?? []).filter((m) => m.device_id === deviceId).map((m) => m.user_id),
  );
  const altrui = (membri ?? [])
    .filter((m) => m.device_id !== deviceId)
    .map((m) => m.user_id);
  // Dispositivo orfano: nessun membro da tutelare, quindi nessun conflitto.
  if (altrui.length === 0) return false;
  // Un utente in comune = stesso telefono reinstallato, o due dispositivi della
  // stessa persona: il token cambia di mano. Zero in comune = un altro account.
  return !altrui.some((u) => miei.has(u));
}

/** `ExponentPushToken[...]` (o la forma nuova `ExpoPushToken[...]`). */
const EXPO_TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{8,200}\]$/;

export async function POST(request: Request) {
  const auth = await authenticateDevice(request, "push-token");
  if (!auth.ok) return auth.response;

  const raw = await request.text();
  if (raw.length > MAX_BODY) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  // `JSON.parse` non lancia su `null`, un numero o un array: sono JSON validi
  // senza i campi che servono. Si controlla la forma prima di leggerli.
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  // `in` invece di un `as`: su un `object` restringe il campo a `unknown`, che
  // e' esattamente cio' che e' — dato non fidato, da controllare a mano.
  const expoToken = "expoToken" in payload ? payload.expoToken : null;
  const platform = "platform" in payload ? payload.platform : null;
  if (typeof expoToken !== "string" || !EXPO_TOKEN.test(expoToken)) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Prima di prendersi un token gia' registrato altrove, si controlla di chi
  // era. Il caso buono e' il telefono reinstallato o ripristinato da un backup:
  // stesso token, dispositivo nuovo, **stessa persona** — e li' il passaggio di
  // mano deve avvenire, altrimenti quel telefono non riceve piu' niente. Il caso
  // da fermare e' il token di un altro account: chi lo presentasse si farebbe
  // recapitare sul proprio telefono le notifiche di quell'account (nome di chi
  // scrive, titolo guardato, commenti). Si confrontano quindi i membri dei due
  // dispositivi: se non hanno nessun utente in comune, non se ne fa niente.
  const conflitto = await tokenDiUnAltroAccount(
    supabase,
    expoToken,
    auth.device.deviceId,
  );
  if (conflitto === "errore") {
    return NextResponse.json(
      { error: "Servizio temporaneamente non disponibile" },
      { status: 503 },
    );
  }
  if (conflitto) {
    // Nessun dettaglio su chi ce l'ha: il messaggio dice cosa fare, non di chi
    // e' il token.
    return NextResponse.json(
      { error: "Token già registrato da un altro account" },
      { status: 409 },
    );
  }

  // Chiave di conflitto il token Expo, non il dispositivo: lo stesso token puo'
  // migrare da un'installazione all'altra (ripristino di un backup), e due righe
  // con lo stesso token farebbero arrivare la notifica due volte.
  const { error } = await supabase.from("push_tokens").upsert(
    {
      expo_token: expoToken,
      device_id: auth.device.deviceId,
      platform,
      updated_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "expo_token" },
  );
  if (error) {
    console.error("[devices/push-token] upsert", error.message);
    return NextResponse.json(
      { error: "Servizio temporaneamente non disponibile" },
      { status: 503 },
    );
  }

  return new NextResponse(null, { status: 204 });
}

/** Uscita dall'account o notifiche spente: il dispositivo non riceve piu'. */
export async function DELETE(request: Request) {
  const auth = await authenticateDevice(request, "push-token");
  if (!auth.ok) return auth.response;

  const { error } = await createServiceClient()
    .from("push_tokens")
    .delete()
    .eq("device_id", auth.device.deviceId);
  if (error) {
    console.error("[devices/push-token] delete", error.message);
    return NextResponse.json(
      { error: "Servizio temporaneamente non disponibile" },
      { status: 503 },
    );
  }

  return new NextResponse(null, { status: 204 });
}

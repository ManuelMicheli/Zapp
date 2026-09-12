import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Portabilità dei dati (art. 20 GDPR).
 *
 * Route handler e non Server Action: deve restituire un file, e una Server Action
 * non sa impostare `Content-Disposition`.
 *
 * Client a cookie, quindi RLS attiva: per costruzione esce solo ciò che l'utente
 * ha diritto di vedere di sé. Il service client qui sarebbe un errore.
 */

/**
 * Tabella → colonna che lega la riga all'utente.
 *
 * La colonna **non è `user_id` ovunque**: chiedere `user_id` a `title_lists` non dà
 * zero righe, dà un errore 400 che finirebbe nel catch e svuoterebbe la voce in
 * silenzio. Ogni nome è stato verificato su `src/types/database.ts` il 2026-09-12.
 */
const TABELLE: Array<readonly [string, string]> = [
  ["profiles", "id"],
  ["user_preferences", "user_id"],
  ["user_consents", "user_id"],
  ["watch_entries", "user_id"],
  ["episode_watches", "user_id"],
  ["imports", "user_id"],
  ["reviews", "user_id"],
  ["review_comments", "user_id"],
  ["review_likes", "user_id"],
  ["title_comments", "user_id"],
  ["title_lists", "owner_id"],
  ["title_list_items", "added_by"],
  ["title_list_members", "user_id"],
  ["user_seed_picks", "user_id"],
  ["user_taste", "user_id"],
  ["user_events", "user_id"],
  ["search_history", "user_id"],
  ["user_locations", "user_id"],
  ["cinema_favorites", "user_id"],
  ["cinema_plans", "user_id"],
  ["daily_answers", "user_id"],
  ["daily_question_views", "user_id"],
  ["activities", "user_id"],
  ["activity_likes", "user_id"],
  ["notifications", "user_id"],
  ["reports", "reporter_id"],
  ["watch_sessions", "user_id"],
  ["pending_scrobbles", "user_id"],
  ["device_members", "user_id"],
  ["device_profiles", "user_id"],
];

/** Quante righe di biglietti elencare: sopra questo non è più un export, è un backup. */
const MAX_BIGLIETTI = 100;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Non autorizzato", { status: 401 });

  // Condiviso: è una lettura pesante, e il limite deve valere per tutta
  // l'applicazione, non per la singola lambda.
  if (!(await rateLimit(`export:${user.id}`, 1, 3600, { condiviso: true }))) {
    return new Response("Hai già scaricato i tuoi dati da poco. Riprova fra un'ora.", {
      status: 429,
    });
  }

  const dati: Record<string, unknown> = {};
  await Promise.all(
    TABELLE.map(async ([tabella, colonna]) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(tabella as any)
        .select("*")
        .eq(colonna, user.id);
      if (error) {
        console.error(`[export] ${tabella}:`, error);
        dati[tabella] = [];
        return;
      }
      dati[tabella] = data ?? [];
    }),
  );

  // Tabelle con due colonne utente: una `.eq()` sola non le copre.
  // `.or()` con un id interpolato è sicuro **qui** perché `user.id` viene dalla
  // sessione verificata sopra, mai dal client — è l'opposto del caso di
  // `removeFriend`, dove l'id dell'altro utente arrivava da fuori e un valore con
  // virgole riscriveva la condizione.
  const { data: amicizie } = await supabase
    .from("friendships")
    .select("*")
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
  dati.friendships = amicizie ?? [];

  const { data: consigli } = await supabase
    .from("recommendations")
    .select("*")
    .or(`from_user.eq.${user.id},to_user.eq.${user.id}`);
  dati.recommendations = consigli ?? [];

  const { data: link } = await supabase
    .from("recommendation_links")
    .select("*")
    .or(`sender_id.eq.${user.id},consumed_by.eq.${user.id}`);
  dati.recommendation_links = link ?? [];

  // `devices` non ha una colonna utente: il legame passa da `device_members`.
  const idDispositivi = ((dati.device_members ?? []) as Array<{ device_id: string }>).map(
    (m) => m.device_id,
  );
  if (idDispositivi.length > 0) {
    const { data: dispositivi } = await supabase
      .from("devices")
      .select("*")
      .in("id", idDispositivi);
    dati.devices = dispositivi ?? [];
  } else {
    dati.devices = [];
  }

  // I biglietti sono file da megabyte: si elencano, non si incorporano.
  const { data: files } = await supabase.storage
    .from("tickets")
    .list(user.id, { limit: MAX_BIGLIETTI });
  dati.tickets_files = (files ?? []).map((f) => ({
    nome: f.name,
    dimensione: f.metadata?.size ?? null,
    creato: f.created_at,
  }));

  const corpo = JSON.stringify(
    {
      esportato_il: new Date().toISOString(),
      utente: { id: user.id, email: user.email },
      dati,
    },
    null,
    2,
  );

  const giorno = new Date().toISOString().slice(0, 10);
  return new Response(corpo, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="zapp-dati-${giorno}.json"`,
      "cache-control": "no-store",
    },
  });
}

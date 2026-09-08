import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { buildTasteProfile, metaKey, type TitleMeta } from "./profile";
import { rawWeight, type TasteRow } from "./weights";
import type { Json } from "@/types/database";

/** Quanti titoli di testa meritano una lettura di `titles.raw` (registi, cast, lingua). */
const TITOLI_CON_CREDITI = 50;
/** Quanti interpreti tenere per titolo, oltre al regista. */
const PERSONE_PER_TITOLO = 4;
/** Storico degli eventi: oltre, si cancella. */
const RITENZIONE_GIORNI = 90;
/** Feed e notifiche oltre questa eta' non li guarda piu' nessuno. */
const RITENZIONE_SOCIALE_GIORNI = 90;
/** Tetto del piano Supabase Free. Oltre l'80% conviene saperlo prima. */
const TETTO_PIANO_BYTE = 500 * 1024 * 1024;

type Service = ReturnType<typeof createServiceClient>;

interface RigaSql {
  title_id: number;
  media_type: "movie" | "tv";
  status: TasteRow["status"];
  rating: number | null;
  last_watched_at: string | null;
  is_seed: boolean;
  impression_sessioni: number;
  aperture: number;
  provider_aperture: number;
  trailer: number;
  dismissi: number;
  ultimo_evento: string | null;
}

function toRow(r: RigaSql): TasteRow {
  return {
    titleId: r.title_id,
    mediaType: r.media_type,
    status: r.status,
    rating: r.rating,
    lastWatchedAt: r.last_watched_at,
    isSeed: r.is_seed,
    impressionSessions: r.impression_sessioni,
    opens: r.aperture,
    providerOpens: r.provider_aperture,
    trailers: r.trailer,
    dismisses: r.dismissi,
    lastEventAt: r.ultimo_evento,
  };
}

function generiDi(raw: Json | null): number[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((g) => (g && typeof g === "object" ? (g as { id?: unknown }).id : null))
    .filter((id): id is number => typeof id === "number");
}

/** Generi, anno e durata dai titoli; i provider dalle offerte. Mai `raw`. */
async function caricaMeta(
  supabase: Service,
  rows: TasteRow[],
): Promise<Map<string, TitleMeta>> {
  const meta = new Map<string, TitleMeta>();
  if (rows.length === 0) return meta;

  const movieIds = rows.filter((r) => r.mediaType === "movie").map((r) => r.titleId);
  const tvIds = rows.filter((r) => r.mediaType === "tv").map((r) => r.titleId);
  const tutti = [...movieIds, ...tvIds];

  // `raw` pesa ~27 KB per riga e qui le righe sono fino a mille: si chiedono solo le
  // colonne che servono, come fa `TITLE_LIST_COLUMNS` per le liste.
  const colonne = "id, media_type, genres, release_date, runtime";
  const [film, serie, offerte] = await Promise.all([
    movieIds.length > 0
      ? supabase
          .from("titles")
          .select(colonne)
          .eq("media_type", "movie")
          .in("id", movieIds)
      : Promise.resolve({ data: [] }),
    tvIds.length > 0
      ? supabase.from("titles").select(colonne).eq("media_type", "tv").in("id", tvIds)
      : Promise.resolve({ data: [] }),
    tutti.length > 0
      ? supabase
          .from("title_providers")
          .select("title_id, media_type, provider_id")
          .in("title_id", tutti)
      : Promise.resolve({ data: [] }),
  ]);

  const provider = new Map<string, number[]>();
  for (const o of (offerte.data ?? []) as {
    title_id: number;
    media_type: "movie" | "tv";
    provider_id: number;
  }[]) {
    const k = metaKey(o.media_type, o.title_id);
    const elenco = provider.get(k);
    if (elenco) elenco.push(o.provider_id);
    else provider.set(k, [o.provider_id]);
  }

  const righe = [...(film.data ?? []), ...(serie.data ?? [])] as {
    id: number;
    media_type: "movie" | "tv";
    genres: Json | null;
    release_date: string | null;
    runtime: number | null;
  }[];

  for (const t of righe) {
    const k = metaKey(t.media_type, t.id);
    meta.set(k, {
      mediaType: t.media_type,
      genreIds: generiDi(t.genres),
      year: t.release_date ? Number(t.release_date.slice(0, 4)) || null : null,
      runtime: t.runtime,
      providerIds: provider.get(k) ?? [],
      people: [],
      originalLanguage: null,
    });
  }
  return meta;
}

/**
 * Registi, interpreti e lingua originale, **solo per i titoli di testa**.
 *
 * Stanno in `titles.raw` (~27 KB per riga), e `titles` non ha una colonna
 * `original_language`: leggere `raw` per l'intera libreria ripeterebbe l'errore che
 * è costato 34 MB di serializzazione sul profilo, e per cui esiste
 * `TITLE_LIST_COLUMNS`. Cinquanta titoli sono un paio di megabyte dentro un job, e
 * bastano: le persone che contano stanno in cima, non in coda.
 */
async function arricchisciTeste(
  supabase: Service,
  meta: Map<string, TitleMeta>,
  teste: TasteRow[],
): Promise<void> {
  if (teste.length === 0) return;
  const { data } = await supabase
    .from("titles")
    .select("id, media_type, raw")
    .in(
      "id",
      teste.map((t) => t.titleId),
    );

  for (const t of (data ?? []) as {
    id: number;
    media_type: "movie" | "tv";
    raw: Json | null;
  }[]) {
    const m = meta.get(metaKey(t.media_type, t.id));
    if (!m || !t.raw || typeof t.raw !== "object" || Array.isArray(t.raw)) continue;
    const raw = t.raw as Record<string, unknown>;

    const lingua = raw.original_language;
    if (typeof lingua === "string" && lingua) m.originalLanguage = lingua;

    const credits = raw.credits as
      | { cast?: { name?: unknown }[]; crew?: { name?: unknown; job?: unknown }[] }
      | undefined;
    if (!credits) continue;

    const nomi: string[] = [];
    for (const c of credits.crew ?? []) {
      if (c.job === "Director" && typeof c.name === "string")
        nomi.push(`Regia:${c.name}`);
    }
    for (const c of (credits.cast ?? []).slice(0, PERSONE_PER_TITOLO)) {
      if (typeof c.name === "string") nomi.push(`Cast:${c.name}`);
    }
    m.people = nomi;
  }
}

/** Ricalcola e salva il profilo di un utente. `false` se non c'era niente da salvare. */
export async function refreshTasteFor(userId: string): Promise<boolean> {
  const supabase = createServiceClient();

  const [input, pref] = await Promise.all([
    supabase.rpc("taste_input", { uid: userId }),
    supabase
      .from("user_preferences")
      .select("birth_year, personalization_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (input.error) throw new Error(`taste_input: ${input.error.message}`);
  if (pref.data && !pref.data.personalization_enabled) return false;

  const rows = ((input.data ?? []) as RigaSql[]).map(toRow);
  if (rows.length === 0) return false;

  const meta = await caricaMeta(supabase, rows);

  // I titoli col peso grezzo più alto: gli unici per cui vale leggere `raw`.
  const teste = [...rows]
    .sort((a, b) => rawWeight(b) - rawWeight(a))
    .slice(0, TITOLI_CON_CREDITI);
  await arricchisciTeste(supabase, meta, teste);

  const profilo = buildTasteProfile({
    birthYear: pref.data?.birth_year ?? null,
    rows,
    meta,
    now: new Date(),
  });

  const { error } = await supabase.from("user_taste").upsert(
    {
      user_id: userId,
      generi: profilo.generi as unknown as Json,
      decenni: profilo.decenni as unknown as Json,
      provider: profilo.provider as unknown as Json,
      persone: profilo.persone as unknown as Json,
      tipo: profilo.tipo as unknown as Json,
      runtime: profilo.runtime as unknown as Json,
      lingua: profilo.lingua as unknown as Json,
      novita: profilo.novita,
      massa: profilo.massa,
      eventi_contati: profilo.eventiContati,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`user_taste: ${error.message}`);
  return true;
}

/** Il giro del job: gli utenti con qualcosa di nuovo dall'ultimo ricalcolo. */
export async function refreshTasteBatch(
  limit: number,
): Promise<{ utenti: number; scritti: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("taste_refresh_queue", { want: limit });
  if (error) throw new Error(`coda dei profili: ${error.message}`);

  const utenti = (data ?? []) as { user_id: string }[];
  let scritti = 0;
  for (const u of utenti) {
    try {
      if (await refreshTasteFor(u.user_id)) scritti += 1;
    } catch (e) {
      // Un utente che fallisce non deve far cadere il giro degli altri.
      console.error(`[taste] profilo di ${u.user_id} non aggiornato:`, e);
    }
  }
  return { utenti: utenti.length, scritti };
}

/**
 * Potatura: 90 giorni di storico e niente per chi ha spento la
 * personalizzazione. Poi feed e notifiche, che crescono per utente e finora non
 * li potava nessuno. Infine un'occhiata a quanto pesa il database.
 */
export async function pruneEvents(): Promise<{
  eliminati: number;
  spenti: number;
  attivita: number;
  notifiche: number;
  dbByte: number;
}> {
  const supabase = createServiceClient();
  const soglia = new Date(Date.now() - RITENZIONE_GIORNI * 86_400_000).toISOString();

  const { count, error } = await supabase
    .from("user_events")
    .delete({ count: "exact" })
    .lt("created_at", soglia);
  if (error) throw new Error(`potatura: ${error.message}`);

  // Rete di sicurezza: se una cancellazione allo spegnimento fosse fallita, qui
  // rientra. Meglio due controlli che una riga di telemetria di chi ha detto no.
  const { data: spentiRows } = await supabase
    .from("user_preferences")
    .select("user_id")
    .eq("personalization_enabled", false);
  const spenti = (spentiRows ?? []).map((r) => r.user_id);
  if (spenti.length > 0) {
    await supabase.from("user_events").delete().in("user_id", spenti);
    await supabase.from("user_taste").delete().in("user_id", spenti);
  }

  const sogliaSociale = new Date(
    Date.now() - RITENZIONE_SOCIALE_GIORNI * 86_400_000,
  ).toISOString();

  const { count: attivita } = await supabase
    .from("activities")
    .delete({ count: "exact" })
    .lt("created_at", sogliaSociale);

  const { count: notifiche } = await supabase
    .from("notifications")
    .delete({ count: "exact" })
    .lt("created_at", sogliaSociale);

  // Il piano Free si ferma a 500 MB e il progetto va in sola lettura senza
  // preavviso. `job_runs` e' gia' il posto dove si guarda cosa e' successo di
  // notte: il numero ci finisce sempre, il log solo quando serve muoversi.
  const { data: byte } = await supabase.rpc("db_size_bytes");
  const dbByte = Number(byte ?? 0);
  if (dbByte > TETTO_PIANO_BYTE * 0.8) {
    console.error(
      `[jobs] database all'${Math.round((dbByte / TETTO_PIANO_BYTE) * 100)}% del piano`,
    );
  }

  return {
    eliminati: count ?? 0,
    spenti: spenti.length,
    attivita: attivita ?? 0,
    notifiche: notifiche ?? 0,
    dbByte,
  };
}

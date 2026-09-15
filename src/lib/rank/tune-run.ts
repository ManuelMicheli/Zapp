import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { caricaMeta } from "@/lib/taste/refresh";
import { metaKey, type TitleMeta } from "@/lib/taste/profile";
import { valoreDimensione } from "./affinity";
import { tuneWeights, type CampioneTaratura, type Esito } from "./tune";
import { toTasteVector } from "./vector";
import type { Dimensione, MediaType, RankCandidate } from "./types";
import type { Json } from "@/types/database";

/**
 * Il giro del ciclo chiuso: legge com'è andata e riscrive i pesi di ogni utente.
 *
 * L'idraulica; le scelte discutibili stanno tutte in `tune.ts`, che è puro e si legge
 * in un test. Gira di notte (job `rank-tune`, `pg_cron` alle 03:40, migration 0061) e
 * **non tocca niente nel percorso caldo**: durante un render della home non si scrive
 * una riga in più di prima.
 */

/** Quanti utenti per giro: stanno nei 60 s della funzione Vercel come `taste-refresh`. */
const UTENTI_PER_GIRO = 150;
/** Quanto indietro si guarda. Gli eventi vengono comunque potati a 90 giorni. */
const GIORNI = 90;

const DIMENSIONI: Dimensione[] = [
  "generi",
  "persone",
  "provider",
  "decenni",
  "tipo",
  "runtime",
  "lingua",
];

/**
 * Un `RankCandidate` finto, giusto quanto basta a `valoreDimensione`.
 *
 * La taratura deve misurare le dimensioni **con la stessa funzione** che le ha usate per
 * fare la proposta, altrimenti imparerebbe su un modello diverso da quello che decide.
 * Voto, fama e amici qui non servono: si sta misurando il gusto, non il punteggio.
 */
function comeCandidato(
  mediaType: MediaType,
  titleId: number,
  m: TitleMeta,
): RankCandidate {
  return {
    id: titleId,
    mediaType,
    title: "",
    posterPath: "",
    backdropPath: null,
    overview: null,
    year: m.year === null ? null : String(m.year),
    genreIds: m.genreIds,
    runtime: m.runtime,
    originalLanguage: m.originalLanguage,
    providerIds: m.providerIds,
    people: m.people,
    zappScore: null,
    voteAverage: null,
    voteCount: null,
    inChart: null,
    freschezza: 1,
    friends: null,
  };
}

function esitoValido(v: unknown): v is Esito {
  return v === "forte" || v === "lieve" || v === "rifiuto";
}

/** Quanti titoli meritano una lettura del cast: oltre, non cambia più il risultato. */
const CON_PERSONE = 300;
/** Lotti della RPC: `in (...)` con seicento id è una query che non vuole nessuno. */
const LOTTO = 100;

/**
 * Registi e interpreti dei titoli del campione.
 *
 * **Senza questa funzione la dimensione `persone` non può imparare niente**, ed è la
 * dimensione più interessante di tutte: "questa persona segue i registi" è esattamente
 * il tipo di cosa che il ciclo chiuso esiste per scoprire. `caricaMeta` lascia `people`
 * vuoto — riempie i crediti solo per i cinquanta titoli di testa del *profilo*, che sono
 * un altro insieme — quindi ogni candidato arrivava qui senza cast, `valoreDimensione`
 * tornava `null` per `persone`, e `tuneWeights` non vedeva mai un `lift`. Visto sul
 * campione vero di un utente (534 titoli): `lift` presente su cinque dimensioni,
 * **mancante proprio su `persone`**.
 *
 * Si usa la RPC `title_people` (migration 0026), la stessa del motore: apre `titles.raw`
 * dentro Postgres e sul filo passano i nomi, non i 27 KB per riga. E le etichette sono
 * nella stessa forma di `user_taste.persone` (`Regia:Nome`), che è ciò che le rende
 * confrontabili.
 *
 * `lingua` resta fuori di proposito: sta solo in `raw`, `titles` non ha una colonna, e
 * pesa 0,05 — non vale una lettura di `raw` per trecento righe.
 */
async function aggiungiPersone(
  supabase: ReturnType<typeof createServiceClient>,
  meta: Map<string, TitleMeta>,
  righe: readonly { title_id: number; media_type: MediaType }[],
): Promise<void> {
  const ids = [...new Set(righe.map((r) => r.title_id))].slice(0, CON_PERSONE);
  for (let i = 0; i < ids.length; i += LOTTO) {
    const { data, error } = await supabase.rpc("title_people", {
      ids: ids.slice(i, i + LOTTO),
    });
    if (error) {
      console.error("[rank] cast del campione non letto:", error.message);
      return;
    }
    for (const r of (data ?? []) as {
      title_id: number;
      media_type: MediaType;
      people: string[] | null;
    }[]) {
      const m = meta.get(metaKey(r.media_type, r.title_id));
      if (m) m.people = r.people ?? [];
    }
  }
}

/** Ricalcola e salva i pesi di un utente. `false` se non c'era niente da imparare. */
export async function tuneRankFor(userId: string): Promise<boolean> {
  const supabase = createServiceClient();

  const [campioneRes, profiloRes, prefRes] = await Promise.all([
    supabase.rpc("rank_tune_input", { uid: userId, giorni: GIORNI }),
    supabase.from("user_taste").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("user_preferences")
      .select("personalization_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // Tre livelli di rispetto dello stesso interruttore, come per il profilo di gusto: il
  // provider non aggancia, la rotta scarta, il job salta.
  if (prefRes.data && !prefRes.data.personalization_enabled) return false;
  if (campioneRes.error) throw new Error(`rank_tune_input: ${campioneRes.error.message}`);

  const righe = (campioneRes.data ?? []) as {
    title_id: number;
    media_type: MediaType;
    esito: string | null;
  }[];
  if (righe.length === 0) return false;

  // Senza un profilo di gusto non c'è niente su cui misurare le dimensioni: la
  // taratura misura **quanto il gusto ha azzeccato**, non il gusto stesso.
  const vettore = toTasteVector(profiloRes.data ?? null);
  if (!vettore.abbastanza) return false;

  const meta = await caricaMeta(
    supabase,
    righe.map((r) => ({
      titleId: r.title_id,
      mediaType: r.media_type,
      status: null,
      rating: null,
      lastWatchedAt: null,
      isSeed: false,
      impressionSessions: 0,
      opens: 0,
      providerOpens: 0,
      trailers: 0,
      dismisses: 0,
      lastEventAt: null,
    })),
  );
  await aggiungiPersone(supabase, meta, righe);

  const campioni: CampioneTaratura[] = [];
  for (const r of righe) {
    if (!esitoValido(r.esito)) continue;
    const m = meta.get(metaKey(r.media_type, r.title_id));
    // Un titolo non ancora in cache non insegna niente: non sapremmo dire di che genere
    // è, quindi contarlo vorrebbe dire attribuire il suo esito a caso.
    if (!m) continue;
    const c = comeCandidato(r.media_type, r.title_id, m);
    const valori: Partial<Record<Dimensione, number>> = {};
    for (const d of DIMENSIONI) {
      const esito = valoreDimensione(vettore, c, d);
      if (esito) valori[d] = esito.valore;
    }
    campioni.push({ esito: r.esito, valori });
  }

  const taratura = tuneWeights(campioni);
  const { error } = await supabase.from("user_rank_weights").upsert(
    {
      user_id: userId,
      pesi: taratura.pesi as unknown as Json,
      successi: taratura.successi,
      rifiuti: taratura.rifiuti,
      lift: taratura.lift as unknown as Json,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`user_rank_weights: ${error.message}`);
  return true;
}

/** Il giro del job: gli utenti con eventi recenti e una taratura vecchia. */
export async function tuneRankBatch(
  limit = UTENTI_PER_GIRO,
): Promise<{ utenti: number; scritti: number }> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("rank_tune_queue", { want: limit });
  if (error) throw new Error(`coda della taratura: ${error.message}`);

  const utenti = (data ?? []) as { user_id: string }[];
  let scritti = 0;
  for (const u of utenti) {
    try {
      if (await tuneRankFor(u.user_id)) scritti += 1;
    } catch (e) {
      // Un utente che fallisce non deve far cadere il giro degli altri.
      console.error(`[rank] taratura di ${u.user_id} non aggiornata:`, e);
    }
  }
  return { utenti: utenti.length, scritti };
}

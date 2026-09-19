"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { shortById } from "./catalog";

export interface CortoResult {
  ok: boolean;
  /** Lo stato **dopo** l'azione. */
  visto?: boolean;
  preferito?: boolean;
  error?: string;
}

/**
 * I due interruttori di un corto: visto e preferito.
 *
 * Stanno sulla stessa riga di `short_film_entries` (chiave `user_id, short_id`), e
 * il vincolo `short_film_entries_non_vuota` impedisce che resti una riga che non dice
 * niente: quando si spengono entrambi la riga si cancella. Senza, un doppio tocco
 * lascerebbe in tabella una riga per ogni corto sfiorato per sbaglio.
 *
 * `short_id` non arriva mai grezzo dal client fino al database: si cerca nel
 * catalogo (`shortById`) e si usa l'id trovato li'. Cosi' l'unico valore che puo'
 * finire in tabella e' uno dei cento del file, qualunque cosa mandi il browser — il
 * `check` della migration e' la seconda rete, non la prima.
 */
async function scrivi(
  youtubeId: unknown,
  cambia: (stato: { visto: boolean; preferito: boolean }) => {
    visto: boolean;
    preferito: boolean;
  },
): Promise<CortoResult> {
  const corto = typeof youtubeId === "string" ? shortById(youtubeId) : null;
  if (!corto) return { ok: false, error: "Cortometraggio non trovato." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Accedi per tenerne traccia." };

  if (!(await rateLimit(`corti:${user.id}`, 60, 60))) {
    return { ok: false, error: "Troppe richieste, riprova fra poco." };
  }

  const { data: riga } = await supabase
    .from("short_film_entries")
    .select("watched_at, favorite")
    .eq("user_id", user.id)
    .eq("short_id", corto.youtubeId)
    .maybeSingle();

  const prima = { visto: Boolean(riga?.watched_at), preferito: Boolean(riga?.favorite) };
  const dopo = cambia(prima);

  if (!dopo.visto && !dopo.preferito) {
    const { error } = await supabase
      .from("short_film_entries")
      .delete()
      .eq("user_id", user.id)
      .eq("short_id", corto.youtubeId);
    if (error) {
      console.error("[corti] rimozione fallita:", error);
      return { ok: false, error: "Non è riuscito, riprova." };
    }
  } else {
    // `upsert` e non insert+update: fra la lettura qui sopra e la scrittura possono
    // passare due schede aperte sullo stesso corto, e un insert su una riga gia'
    // nata fallirebbe con un errore di chiave duplicata che l'utente non merita.
    const { error } = await supabase.from("short_film_entries").upsert(
      {
        user_id: user.id,
        short_id: corto.youtubeId,
        // La data del "visto" resta quella della prima volta: risegnarlo visto non
        // lo sposta in cima a una lista che dice "gli ultimi che hai visto".
        watched_at: dopo.visto ? (riga?.watched_at ?? new Date().toISOString()) : null,
        favorite: dopo.preferito,
      },
      { onConflict: "user_id,short_id" },
    );
    if (error) {
      console.error("[corti] scrittura fallita:", error);
      return { ok: false, error: "Non è riuscito, riprova." };
    }
  }

  rinfresca(corto.slug);
  return { ok: true, visto: dopo.visto, preferito: dopo.preferito };
}

export async function toggleVisto(youtubeId: string): Promise<CortoResult> {
  return scrivi(youtubeId, (s) => ({ visto: !s.visto, preferito: s.preferito }));
}

export async function togglePreferito(youtubeId: string): Promise<CortoResult> {
  return scrivi(youtubeId, (s) => ({ visto: s.visto, preferito: !s.preferito }));
}

/**
 * Segna visto senza spegnere: lo chiama il player quando il video parte davvero.
 * Idempotente, e non tocca "preferito".
 */
export async function segnaVisto(youtubeId: string): Promise<CortoResult> {
  return scrivi(youtubeId, (s) => ({ visto: true, preferito: s.preferito }));
}

/**
 * Le rotte che mostrano lo stato di un corto: la sua scheda e il catalogo (dove
 * accendono la spunta sulla card e i filtri "Da vedere" e "I tuoi preferiti").
 * Il profilo non li mostra, quindi non va rivalidato: le statistiche del profilo
 * vengono da `profile_stats` e contano film e serie, non corti.
 */
function rinfresca(slug: string) {
  revalidatePath(`/corti/${slug}`);
  revalidatePath("/corti");
}

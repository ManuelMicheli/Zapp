/**
 * Stampa le liste delle pillole "per genere" per un utente.
 *
 * È il collaudo che i test unitari non possono fare: una lista di genere si giudica
 * **leggendola**. "Horror" deve aprirsi su Shining e L'Esorcista, non sull'horror uscito
 * questa settimana; "Classici" non deve contenere niente di dopo il 1990; "Anime" deve
 * essere giapponese davvero.
 *
 *   pnpm tsx --conditions=react-server scripts/genre-dump.ts <user_id> [chiave…]
 *
 * Senza chiavi le stampa tutte. Gira col client di **servizio**, quindi le esclusioni
 * per libreria valgono comunque (si leggono per `user_id`), mentre il segnale sociale
 * non è filtrato dalle policy: per quello serve il browser.
 */
import { loadEnvFile } from "node:process";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

async function main() {
  const { createServiceClient } = await import("../src/lib/supabase/server");
  const { rankContext } = await import("../src/lib/rank/engine");
  const { toTasteVector } = await import("../src/lib/rank/vector");
  const { GENRES, genreByKey } = await import("../src/lib/genres/catalog");
  const { genreListFor } = await import("../src/lib/genres/list");

  const [userId, ...chiavi] = process.argv.slice(2);
  if (!userId) {
    console.error(
      "uso: pnpm tsx --conditions=react-server scripts/genre-dump.ts <user_id> [chiave…]",
    );
    process.exit(1);
  }

  const voci = chiavi.length > 0 ? chiavi.map((k) => genreByKey(k)) : GENRES;
  if (voci.some((v) => v === null)) {
    console.error("chiave sconosciuta fra quelle passate");
    process.exit(1);
  }

  const db = createServiceClient();
  const [{ data: profilo }, ctx] = await Promise.all([
    db.from("user_taste").select("*").eq("user_id", userId).maybeSingle(),
    rankContext(userId, db),
  ]);
  const vettore = toTasteVector(profilo ?? null);
  console.log(
    profilo
      ? `profilo: massa ${profilo.massa} · ${vettore.abbastanza ? "percentuale mostrata" : "percentuale nascosta"}`
      : "nessun profilo di gusto: ordine pubblico",
  );

  for (const entry of voci) {
    if (!entry) continue;
    for (const type of entry.tv === null ? (["movie"] as const) : ["movie", "tv"]) {
      const items = await genreListFor(entry, type as "movie" | "tv", ctx, vettore);
      console.log(`\n===== ${entry.pillola} · ${type} (${items.length}) =====`);
      for (const [i, x] of items.entries()) {
        const perc = x.affinity === null || x.affinity === undefined ? "  —" : `${String(x.affinity).padStart(3)}%`;
        const voto = x.rating ? x.rating.toFixed(1) : " — ";
        console.log(
          `${String(i + 1).padStart(2)}. ${perc} ${voto}  ${(x.year ?? "----").padEnd(4)}  ${x.title}`,
        );
      }
    }
  }
}

void main();

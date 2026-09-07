/**
 * Rimisura il riquadro dell'immagine (bande nere escluse) di ogni trailer già salvato e
 * riscrive `title_trailers.trailers`. Serve dopo un backfill fatto senza la misura, o
 * quando cambiano le regole di `frame-bars.ts`: la riga vale 30 giorni, quindi un
 * riquadro sbagliato resterebbe in pagina per un mese.
 *
 * Non tocca chiavi, lingua, provenienza né scadenze: cambia solo `frame`. Nessuna quota
 * YouTube, legge solo le miniature `i.ytimg.com`.
 *
 * Uso: pnpm tsx scripts/refresh-trailer-frames.ts [--only-full]
 *   --only-full  rimisura solo le righe che dichiarano il frame intero
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";
import type { Trailer } from "../src/lib/trailers/frame-bars";
import { trailerFrameRaw } from "./trailer-deps";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

const onlyFull = process.argv.includes("--only-full");

/** Il riquadro è cambiato abbastanza da meritare una riscrittura? */
function differs(a: Trailer["frame"], b: Trailer["frame"]): boolean {
  return (
    Math.abs(a.x - b.x) > 0.002 ||
    Math.abs(a.y - b.y) > 0.002 ||
    Math.abs(a.w - b.w) > 0.002 ||
    Math.abs(a.h - b.h) > 0.002
  );
}

function isFullFrame(f: Trailer["frame"]): boolean {
  return f.x === 0 && f.y === 0 && f.w === 1 && f.h === 1;
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await db
    .from("title_trailers")
    .select("title_id, media_type, season_number, trailers");
  if (error) throw error;

  let looked = 0;
  let updated = 0;
  for (const row of data ?? []) {
    const trailers = row.trailers as unknown as Trailer[] | null;
    if (!Array.isArray(trailers) || trailers.length === 0) continue;
    if (onlyFull && !trailers.some((t) => isFullFrame(t.frame))) continue;

    looked += 1;
    const measured = await Promise.all(
      trailers.map(async (t) => ({ ...t, frame: await trailerFrameRaw(t.key) })),
    );
    if (!measured.some((t, i) => differs(t.frame, trailers[i].frame))) continue;

    const { error: writeError } = await db
      .from("title_trailers")
      .update({ trailers: measured as unknown as never })
      .eq("title_id", row.title_id)
      .eq("media_type", row.media_type)
      .eq("season_number", row.season_number);
    if (writeError) {
      console.error(`errore su ${row.title_id}:`, writeError.message);
      continue;
    }
    updated += 1;
    const shapes = measured
      .map((t) => `${t.key} ${t.frame.w.toFixed(2)}x${t.frame.h.toFixed(2)}`)
      .join(", ");
    console.log(`${row.title_id}/${row.media_type} s${row.season_number} → ${shapes}`);
  }
  console.log(`\nguardate ${looked} righe, riscritte ${updated}`);
}

void main();

/**
 * Override manuale del link biglietteria di un cinema (mai sovrascritto).
 * Uso: pnpm tsx scripts/set-cinema-link.ts <cinema_id> <https url>
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

const [cinemaId, url] = process.argv.slice(2);

if (!/^\d+$/.test(cinemaId ?? "") || !url?.startsWith("https://")) {
  console.error("Uso: pnpm tsx scripts/set-cinema-link.ts <cinema_id> <https url>");
  process.exit(1);
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { error } = await db.from("cinema_links").upsert(
    {
      cinema_id: Number(cinemaId),
      url,
      source: "manual",
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "cinema_id" },
  );
  if (error) {
    console.error("Errore:", error.message);
    process.exit(1);
  }
  console.log(`OK: cinema ${cinemaId} → ${url} (manual)`);
}

void main();

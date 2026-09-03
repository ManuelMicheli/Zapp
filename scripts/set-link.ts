/**
 * Override manuale di un link provider.
 * Uso: pnpm tsx scripts/set-link.ts <media_type> <tmdb_id> <provider_id> <url>
 * Esempio: pnpm tsx scripts/set-link.ts tv 1399 8 https://www.netflix.com/title/70305903
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "node:process";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

const [mediaType, tmdbId, providerId, url] = process.argv.slice(2);

if (
  !["movie", "tv"].includes(mediaType) ||
  !/^\d+$/.test(tmdbId ?? "") ||
  !/^\d+$/.test(providerId ?? "") ||
  !url?.startsWith("https://")
) {
  console.error(
    "Uso: pnpm tsx scripts/set-link.ts <movie|tv> <tmdb_id> <provider_id> <https url>",
  );
  process.exit(1);
}

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { error } = await db.from("title_provider_links").upsert(
    {
      title_id: Number(tmdbId),
      media_type: mediaType as "movie" | "tv",
      provider_id: Number(providerId),
      url,
      source: "manual",
      resolved_at: new Date().toISOString(),
    },
    { onConflict: "title_id,media_type,provider_id" },
  );

  if (error) {
    console.error("Errore:", error.message);
    process.exit(1);
  }
  console.log(`OK: ${mediaType}/${tmdbId} provider ${providerId} → ${url} (manual)`);
}

void main();

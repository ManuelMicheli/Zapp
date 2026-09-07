/**
 * Stampa il profilo di gusto di un utente, dopo averlo ricalcolato.
 *
 * Serve a rispondere all'unica domanda che i test unitari non possono verificare:
 * "questo profilo somiglia davvero a quello che l'utente guarda?". Se non somiglia,
 * i pesi sono sbagliati, e si vede solo così.
 *
 *   pnpm tsx --conditions=react-server scripts/taste-dump.ts <user_id>
 *
 * `--conditions=react-server` serve perché `refresh.ts` importa `server-only`, che
 * fuori da quella condizione solleva apposta.
 */
import { loadEnvFile } from "node:process";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));


const NOMI_DIMENSIONI = [
  "generi",
  "decenni",
  "provider",
  "persone",
  "tipo",
  "runtime",
  "lingua",
] as const;

function stampaDimensione(nome: string, valore: unknown) {
  if (!valore || typeof valore !== "object") return;
  const voci = Object.entries(valore as Record<string, number>)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`);
  if (voci.length === 0) return;
  console.log(`  ${nome.padEnd(9)} ${voci.join("  ")}`);
}

async function main() {
  // import dinamici dopo `loadEnvFile`: i moduli del server leggono le variabili
  // d'ambiente al primo import e senza chiave si fermerebbero subito
  const { createServiceClient } = await import("../src/lib/supabase/server");
  const { refreshTasteFor } = await import("../src/lib/taste/refresh");

  const userId = process.argv[2];
  if (!userId) {
    console.error("uso: pnpm tsx scripts/taste-dump.ts <user_id>");
    process.exit(1);
  }

  const scritto = await refreshTasteFor(userId);
  console.log(scritto ? "profilo ricalcolato" : "nessun segnale per questo utente");

  const supabase = createServiceClient();
  const { data: taste } = await supabase
    .from("user_taste")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!taste) {
    console.log("nessuna riga in user_taste");
    return;
  }

  console.log(
    `\nmassa ${taste.massa}  ·  novità ${((taste.novita ?? 0) * 100).toFixed(0)}%  ·  eventi ${taste.eventi_contati}`,
  );
  for (const nome of NOMI_DIMENSIONI) {
    stampaDimensione(nome, taste[nome]);
  }

  const { count } = await supabase
    .from("user_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  console.log(`\nrighe in user_events: ${count ?? 0}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

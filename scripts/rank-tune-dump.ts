/**
 * Mostra cosa il ciclo chiuso ha imparato su un utente, e lo ricalcola.
 *
 * I test unitari dicono che `tuneWeights` sposta i pesi nella direzione giusta su dati
 * finti. Questo dice l'unica cosa che conta davvero: **su questa persona vera, con
 * questi eventi veri, cosa ha imparato?** — e soprattutto se il campione esiste. Un
 * ciclo chiuso che gira ogni notte su zero campioni non fallisce e non impara: senza
 * questo script non lo saprebbe nessuno.
 *
 *   pnpm tsx --conditions=react-server scripts/rank-tune-dump.ts <user_id> [--scrivi]
 *
 * Senza `--scrivi` non tocca il database: stampa il campione e i pesi che *sarebbero*
 * scritti.
 */
import { loadEnvFile } from "node:process";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

async function main() {
  const { createServiceClient } = await import("../src/lib/supabase/server");
  const { tuneRankFor } = await import("../src/lib/rank/tune-run");
  const { toPesi } = await import("../src/lib/rank/tune");

  const argomenti = process.argv.slice(2);
  const scrivi = argomenti.includes("--scrivi");
  const userId = argomenti.find((a) => !a.startsWith("--"));
  if (!userId) {
    console.error(
      "uso: pnpm tsx --conditions=react-server scripts/rank-tune-dump.ts <user_id> [--scrivi]",
    );
    process.exit(1);
  }

  const db = createServiceClient();
  const { data: campione, error } = await db.rpc("rank_tune_input", {
    uid: userId,
    giorni: 90,
  });
  if (error) throw new Error(error.message);

  const righe = (campione ?? []) as { esito: string | null }[];
  const conta = (e: string) => righe.filter((r) => r.esito === e).length;
  console.log(
    `campione: ${righe.length} titoli mostrati — forte ${conta("forte")} · lieve ${conta(
      "lieve",
    )} · rifiuto ${conta("rifiuto")}`,
  );
  if (righe.length === 0) {
    console.log(
      "Nessun campione: o l'utente non ha eventi recenti, o le impression non arrivano.",
    );
  }

  if (scrivi) {
    const fatto = await tuneRankFor(userId);
    console.log(fatto ? "pesi riscritti." : "niente da imparare: pesi lasciati com'erano.");
  }

  const { data: riga } = await db
    .from("user_rank_weights")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const pesi = toPesi(riga?.pesi ?? null);
  console.log(
    `pesi ${riga ? "salvati" : "di partenza"}: ` +
      Object.entries(pesi)
        .map(([d, v]) => `${d} ${(v as number).toFixed(3)}`)
        .join(" · "),
  );
  if (riga) {
    console.log(`lift: ${JSON.stringify(riga.lift)}`);
    console.log(`su ${riga.successi} successi / ${riga.rifiuti} rifiuti`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

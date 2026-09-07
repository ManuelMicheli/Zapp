/**
 * Stampa i consigli del motore di ranking per uno o più utenti.
 *
 * È il collaudo che i test unitari non possono fare: le liste devono **somigliare**
 * agli utenti, e soprattutto due utenti diversi devono ricevere liste diverse. Due
 * liste identiche vorrebbero dire che il gusto non sta entrando nel conto — il difetto
 * più probabile di questa fase, e il meno visibile.
 *
 *   pnpm tsx --conditions=react-server scripts/rank-dump.ts <user_id> [altro_user_id]
 *
 * **Attenzione al segnale sociale**: qui gira il client di servizio, che scavalca le
 * policy, quindi "Visto da X" conta *tutti* gli utenti e non solo gli amici. In app il
 * client è quello a cookie e `watch_entries_select_friends` filtra da sé. Per verificare
 * la parte sociale sul serio serve il browser, non questo script.
 */
import { loadEnvFile } from "node:process";

loadEnvFile(new URL("../.env.local", import.meta.url).pathname.replace(/^\//, ""));

async function main() {
  const { createServiceClient } = await import("../src/lib/supabase/server");
  const { rankFor } = await import("../src/lib/rank/engine");

  const utenti = process.argv.slice(2);
  if (utenti.length === 0) {
    console.error(
      "uso: pnpm tsx --conditions=react-server scripts/rank-dump.ts <user_id> [user_id]",
    );
    process.exit(1);
  }

  const db = createServiceClient();
  console.log(
    "NB: client di servizio — il segnale sociale qui non è filtrato dalle policy.",
  );
  const liste = new Map<string, string[]>();

  for (const userId of utenti) {
    const [{ data: profilo }, { data: profiloUtente }] = await Promise.all([
      db.from("user_taste").select("*").eq("user_id", userId).maybeSingle(),
      db.from("profiles").select("username").eq("id", userId).maybeSingle(),
    ]);

    console.log(`\n===== ${profiloUtente?.username ?? userId} =====`);
    console.log(
      profilo
        ? `massa ${profilo.massa} · novità ${((profilo.novita ?? 0) * 100).toFixed(0)}%`
        : "nessun profilo di gusto",
    );

    for (const type of ["movie", "tv"] as const) {
      const items = await rankFor(userId, type, 10, db, profilo ?? null);
      console.log(`\n-- ${type} --`);
      for (const [i, x] of items.entries()) {
        const perc =
          x.percentuale === null ? "  —" : `${String(x.percentuale).padStart(3)}%`;
        console.log(
          `${String(i + 1).padStart(2)}. ${perc}  ${x.title.slice(0, 42).padEnd(42)} ${x.motivo ?? ""}`,
        );
      }
      liste.set(
        `${userId}|${type}`,
        items.map((x) => `${x.mediaType}-${x.id}`),
      );
    }
  }

  // Il controllo che conta: due utenti, due liste.
  if (utenti.length >= 2) {
    for (const type of ["movie", "tv"] as const) {
      const a = liste.get(`${utenti[0]}|${type}`) ?? [];
      const b = liste.get(`${utenti[1]}|${type}`) ?? [];
      const comuni = a.filter((x) => b.includes(x)).length;
      const su = Math.max(1, Math.min(a.length, b.length));
      console.log(
        `\n[${type}] titoli in comune fra i due utenti: ${comuni}/${su} (${Math.round((100 * comuni) / su)}%)`,
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

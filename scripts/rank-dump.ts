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
 * Ogni riga porta i tre fattori del punteggio — **gusto, qualità e fama** — perché una
 * lista si giudica leggendo *perché* i titoli sono in quell'ordine, non solo quali sono.
 * È guardando questa colonna che il 2026-09-15 si è visto un film del 2026 con 307 voti
 * davanti a Il Padrino.
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
  const { fama, qualitaDi } = await import("../src/lib/rank/fame");
  const { toPesi } = await import("../src/lib/rank/tune");

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
    const [{ data: profilo }, { data: profiloUtente }, { data: preferite }, { data: riga }] =
      await Promise.all([
        db.from("user_taste").select("*").eq("user_id", userId).maybeSingle(),
        db.from("profiles").select("username").eq("id", userId).maybeSingle(),
        db.from("favorite_people").select("name, role").eq("user_id", userId),
        db.from("user_rank_weights").select("*").eq("user_id", userId).maybeSingle(),
      ]);
    // I preferiti arrivano **come parametro**: il motore non deve chiamare
    // `getViewer()`, e qui di cookie non ce ne sono. Vedi `rankContext`.
    const preferiti = (preferite ?? []).map((p) => `${p.role}:${p.name}`);
    const pesi = toPesi(riga?.pesi ?? null);

    console.log(`\n===== ${profiloUtente?.username ?? userId} =====`);
    console.log(
      profilo
        ? `massa ${profilo.massa} · novità ${((profilo.novita ?? 0) * 100).toFixed(0)}%`
        : "nessun profilo di gusto",
    );
    if (preferiti.length > 0) console.log(`preferiti: ${preferiti.join(", ")}`);
    console.log(
      `pesi: ${Object.entries(pesi)
        .map(([d, v]) => `${d} ${(v as number).toFixed(2)}`)
        .join(" · ")}${riga ? ` (su ${riga.successi} successi / ${riga.rifiuti} rifiuti)` : " (di partenza)"}`,
    );

    for (const type of ["movie", "tv"] as const) {
      const items = await rankFor(userId, type, 15, db, profilo ?? null, undefined, {
        preferiti,
        pesi,
      });
      console.log(`\n-- ${type} --`);
      console.log("     perTe  punt  qual  fama    voti  titolo");
      for (const [i, x] of items.entries()) {
        const perc =
          x.percentuale === null ? "  — " : `${String(x.percentuale).padStart(3)}%`;
        const voti = x.voteCount === null ? "     ?" : String(x.voteCount).padStart(6);
        console.log(
          `${String(i + 1).padStart(2)}.  ${perc}  ${x.punteggio.toFixed(2)}  ` +
            `${qualitaDi(x).toFixed(2)}  ${fama(x).toFixed(2)}  ${voti}  ` +
            `${x.title.slice(0, 38).padEnd(38)} ${x.motivo ?? ""}`,
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

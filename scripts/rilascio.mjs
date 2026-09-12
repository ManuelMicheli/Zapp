/**
 * Pubblica Zapp **passando da `origin/main`**, e controlla di non aver
 * cancellato il lavoro di nessun altro.
 *
 *   node scripts/rilascio.mjs            # rilascio vero
 *   node scripts/rilascio.mjs --prova    # solo i controlli, non pubblica
 *   node scripts/rilascio.mjs --senza-push  # pubblica questo albero senza toccare main
 *
 * Perché esiste: su questo progetto lavorano più sessioni insieme, ognuna nel
 * suo worktree, e `vercel --prod` spedisce **l'albero intero** da cui parte. Il
 * 12 settembre 2026 quattro deploy di alberi diversi si sono sovrascritti a
 * vicenda nel giro di un'ora: sono sparite dal live prima le pagine legali e
 * KLIPY, poi l'import multi-sorgente, poi la rotta `/go/…`. Nessuno se n'era
 * accorto, perché il comando dice "Production: …" comunque.
 *
 * Le tre difese, in ordine di importanza:
 *  1. si pubblica solo un albero che contiene già `origin/main`, cioè il lavoro
 *     degli altri: se manca, lo script si ferma e ti dice di unirlo;
 *  2. `origin/main` si aggiorna **prima** del deploy, così il prossimo che
 *     rilascia parte da qui;
 *  3. dopo il deploy si confrontano le rotte con quelle del deployment
 *     precedente: una rotta sparita significa che stavi cancellando qualcosa.
 */
import { execFileSync, execSync } from "node:child_process";

const ARG = new Set(process.argv.slice(2));
const PROVA = ARG.has("--prova");
const SENZA_PUSH = ARG.has("--senza-push");
const ALIAS = "zapp-mu.vercel.app";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * `vercel` senza far esplodere lo script quando risponde male. Passa dalla shell
 * perché su Windows l'eseguibile è `vercel.cmd`, che `execFileSync` non trova.
 */
function vercel(...args) {
  const cmd = `vercel ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`;
  try {
    return execSync(cmd, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

function muori(messaggio, rimedio) {
  console.error(`\n✖ ${messaggio}`);
  if (rimedio) console.error(`\n  ${rimedio}\n`);
  process.exit(1);
}

/** L'URL del deployment che ha il dominio pubblico adesso. */
function deploymentDelDominio() {
  const out = vercel("inspect", ALIAS);
  return out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/)?.[0] ?? null;
}

/**
 * Le rotte di un deployment, lette dalla tabella che Next stampa in build.
 * È l'unico modo di sapere cosa c'è **davvero** dentro un deploy senza
 * credenziali: gli URL `zapp-<hash>` sono protetti e rispondono con la pagina
 * di login di Vercel.
 */
function rotteDi(url) {
  if (!url) return null;
  const log = vercel("inspect", url, "--logs");
  const rotte = new Set();
  for (const riga of log.split("\n")) {
    const m = riga.match(/[├└]\s+[ƒ○●]\s+(\/\S*)/);
    if (m) rotte.add(m[1]);
  }
  return rotte.size > 0 ? rotte : null;
}

// ---- 1. l'albero è pulito? -------------------------------------------------

/**
 * `next build` con `NEXT_DIST_DIR` riscrive `tsconfig.json` per includere i tipi
 * della cartella nuova. È rumore della build di verifica, non lavoro: lo si
 * rimette a posto invece di fermare il rilascio, altrimenti questo controllo
 * scatta ogni volta e la prima cosa che si impara è ad aggirarlo.
 */
const sporchi = git("status", "--porcelain")
  .split("\n")
  .filter(Boolean)
  // "XY percorso": due caratteri di stato, poi il percorso
  .map((r) => r.slice(2).trim());

if (sporchi.includes("tsconfig.json")) {
  const diff = git("diff", "--", "tsconfig.json");
  const soloDistDir = diff
    .split("\n")
    .filter((r) => /^[+-][^+-]/.test(r))
    .every((r) => /\.next[\w-]*\/types/.test(r) || /"next-env\.d\.ts"/.test(r));
  if (soloDistDir) {
    git("checkout", "--", "tsconfig.json");
    sporchi.splice(sporchi.indexOf("tsconfig.json"), 1);
    console.log("• tsconfig.json rimesso a posto (l'aveva riscritto la build)");
  }
}

if (sporchi.length > 0) {
  muori(
    `Ci sono modifiche non committate: ${sporchi.slice(0, 5).join(", ")}${
      sporchi.length > 5 ? ` e altre ${sporchi.length - 5}` : ""
    }.`,
    "Committale: quello che non è in un commit non arriva in produzione, e uno stash qui dentro rischia il lavoro di un'altra sessione.",
  );
}

// ---- 2. contiene già il lavoro degli altri? --------------------------------

git("fetch", "origin", "main");
const mainRemoto = git("rev-parse", "origin/main");
const testa = git("rev-parse", "HEAD");

try {
  execFileSync("git", ["merge-base", "--is-ancestor", mainRemoto, testa]);
} catch {
  muori(
    `Questo albero non contiene origin/main (${mainRemoto.slice(0, 8)}).`,
    "Unisci prima il lavoro degli altri:\n    git merge origin/main\n  poi rilancia. Pubblicare senza farlo cancellerebbe dal live quello che hanno messo loro.",
  );
}

console.log(`✓ albero pulito, e contiene origin/main (${mainRemoto.slice(0, 8)})`);

// ---- 3. com'è il live adesso? ---------------------------------------------

const primaUrl = deploymentDelDominio();
const primaRotte = rotteDi(primaUrl);
console.log(
  `✓ in produzione ora: ${primaUrl ?? "sconosciuto"}${
    primaRotte ? ` (${primaRotte.size} rotte)` : " (rotte non leggibili)"
  }`,
);

if (PROVA) {
  console.log("\n--prova: i controlli passano, non pubblico.");
  process.exit(0);
}

// ---- 4. main prima del deploy ----------------------------------------------

if (!SENZA_PUSH) {
  if (testa === mainRemoto) {
    console.log("✓ origin/main è già a questo commit");
  } else {
    git("push", "origin", `${testa}:main`);
    console.log(`✓ origin/main aggiornato a ${testa.slice(0, 8)}`);
  }
}

// ---- 5. deploy --------------------------------------------------------------

const uscita = vercel("--prod", "--yes");
const dopoUrl = uscita.match(/https:\/\/[a-z0-9-]+\.vercel\.app/)?.[0];
if (!dopoUrl) muori("Il deploy non ha restituito un URL.", uscita.slice(-800));
console.log(`✓ pubblicato: ${dopoUrl}`);

// il dominio non sempre segue: dopo un rollback resta appuntato a mano
if (deploymentDelDominio() !== dopoUrl) {
  vercel("promote", dopoUrl);
  console.log("✓ dominio spostato con promote");
}

// ---- 6. ho cancellato qualcosa? --------------------------------------------

const dopoRotte = rotteDi(dopoUrl);
if (!primaRotte || !dopoRotte) {
  console.log("\n⚠ rotte non confrontabili: controlla a mano con vercel inspect --logs");
  process.exit(0);
}

const sparite = [...primaRotte].filter((r) => !dopoRotte.has(r));
const nuove = [...dopoRotte].filter((r) => !primaRotte.has(r));

if (nuove.length > 0) console.log(`\n+ rotte nuove: ${nuove.join(", ")}`);

if (sparite.length === 0) {
  console.log("\n✓ nessuna rotta persa: il lavoro di tutti è ancora online.\n");
  process.exit(0);
}

console.error(`\n✖ ROTTE SPARITE DAL LIVE: ${sparite.join(", ")}`);
console.error(
  "\n  Erano nel deployment precedente e nel tuo non ci sono: stai cancellando" +
    "\n  il lavoro di un'altra sessione. Torna indietro subito:" +
    `\n    vercel rollback ${primaUrl}` +
    "\n  poi unisci il suo albero al tuo e rilascia di nuovo.\n",
);
process.exit(1);

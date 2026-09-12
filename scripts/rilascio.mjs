/**
 * Pubblica Zapp **passando da `origin/main`**, e controlla di non aver
 * cancellato il lavoro di nessun altro.
 *
 *   node scripts/rilascio.mjs            # rilascio vero
 *   node scripts/rilascio.mjs --prova    # solo i controlli, non pubblica
 *   node scripts/rilascio.mjs --senza-push  # solo i controlli, non tocca main
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
 *  3. il deploy **non parte da qui**: il progetto Vercel e' agganciato a
 *     GitHub e il push su `main` fa partire da solo la build di produzione,
 *     che clona il repo. Cosi' non esiste piu' il gesto che cancellava il
 *     lavoro altrui, cioe' spedire il proprio albero;
 *  4. a build finita si confrontano rotte e pesi con il deployment
 *     precedente: una rotta sparita significa che qualcosa e' andato perso.
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
  // `2>&1` perche' vercel stampa url, alias ed errori su stderr, non su stdout
  const cmd = `vercel ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" ")} 2>&1`;
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
 * Le rotte di un deployment **col loro peso**, lette dalla tabella che Next
 * stampa in build. Il peso serve perche' il confronto dei soli nomi non vede
 * le modifiche *dentro* una pagina: due sessioni che toccano la stessa rotta
 * hanno lo stesso elenco e pesi diversi.
 * È l'unico modo di sapere cosa c'è **davvero** dentro un deploy senza
 * credenziali: gli URL `zapp-<hash>` sono protetti e rispondono con la pagina
 * di login di Vercel.
 */
function rotteDi(url, tentativi = 1) {
  if (!url) return null;
  let migliore = new Map();
  for (let i = 0; i < tentativi; i++) {
    const rotte = new Map();
    // Si legge **solo** fra l'intestazione della tabella di Next e la sua
    // legenda: prima ci sono i log del caricamento, che elencano i file veri
    // (`/.env.example`, `/.git/config`) e sembrerebbero rotte sparite.
    let dentro = false;
    for (const riga of vercel("inspect", url, "--logs").split("\n")) {
      if (/Route \(app\)/.test(riga)) {
        dentro = true;
        continue;
      }
      if (!dentro) continue;
      if (/First Load JS shared by all|\(Static\)|Middleware/.test(riga)) break;
      // Niente caratteri di disegno (├ ƒ ○ ●): su Windows la console li
      // consegna storpiati e mezza tabella sparirebbe. Le due forme vere sono
      // "…  /rotta   3.64 kB   156 kB" e la sotto-voce di una rotta dinamica,
      // "…  /import/netflix" da sola a fine riga.
      const percorso = riga.match(
        /\s(\/[\w[\]().\-/]*)\s+(\d[\d.]*\s*[kKmM]?B)\s+(\d[\d.]*\s*[kKmM]?B)/,
      );
      const sottovoce = riga.match(/\s(\/[\w[\]().\-/]+)\s*$/);
      if (percorso) rotte.set(percorso[1], percorso[3].replace(/\s+/g, ""));
      else if (sottovoce) rotte.set(sottovoce[1], "");
    }
    if (rotte.size > migliore.size) migliore = rotte;
    // la tabella di un deploy appena fatto arriva a pezzi: si riprova finché
    // non smette di crescere, se no mezza tabella sembra lavoro cancellato
    if (i < tentativi - 1) attendi(6);
  }
  return migliore.size > 0 ? migliore : null;
}

/** Pausa senza dipendenze, per lasciare arrivare il resto dei log. */
function attendi(secondi) {
  const fine = Date.now() + secondi * 1000;
  while (Date.now() < fine) {
    // attesa attiva: sono pochi secondi, e serve restare sincroni
  }
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

// ---- 5. il deploy lo fa il push --------------------------------------------

/**
 * Il progetto Vercel è agganciato a GitHub: **un push su `main` fa partire da
 * solo un deploy di produzione**, che clona il repo. Quindi non si carica
 * niente da qui: `vercel --prod` spedirebbe questo albero, ed è proprio il
 * gesto che il 12 settembre ha cancellato il lavoro delle altre sessioni.
 * Si aspetta la build di **questo** commit e si guarda com'è andata.
 */
function aspettaIlDeployDelCommit(sha, minuti = 12) {
  const scadenza = Date.now() + minuti * 60 * 1000;
  const corto = sha.slice(0, 7);
  while (Date.now() < scadenza) {
    for (const riga of vercel("ls", "zapp", "--prod").split("\n")) {
      const url = riga.match(/https:\/\/[a-z0-9-]+\.vercel\.app/)?.[0];
      if (!url) continue;
      const log = vercel("inspect", url, "--logs");
      if (!new RegExp(`Commit: ${corto}`).test(log)) continue;
      if (/Build Completed|Deployment completed/.test(log)) return url;
      console.log(`  …build di ${corto} in corso (${url})`);
    }
    attendi(20);
  }
  return null;
}

if (SENZA_PUSH) {
  console.log("\n--senza-push: non ho toccato main, quindi non parte nessun deploy.");
  process.exit(0);
}

console.log("• aspetto la build che GitHub fa partire da sola…");
const dopoUrl = aspettaIlDeployDelCommit(testa);
if (!dopoUrl) {
  muori(
    "La build di questo commit non è arrivata in dodici minuti.",
    "Guarda `vercel ls zapp --prod`: se non c'è, l'aggancio a GitHub potrebbe essere saltato.\n  NON pubblicare con `vercel --prod` per rimediare: spedirebbe questo albero e cancellerebbe il lavoro delle altre sessioni.",
  );
}
console.log(`✓ pubblicato da main: ${dopoUrl}`);

// dopo un rollback il dominio resta appuntato a mano e non segue le build nuove
if (deploymentDelDominio() !== dopoUrl) {
  vercel("promote", dopoUrl);
  console.log("✓ dominio spostato con promote");
}

// ---- 6. ho cancellato qualcosa? --------------------------------------------

const dopoRotte = rotteDi(dopoUrl, 4);
if (!primaRotte || !dopoRotte) {
  console.log("\n⚠ rotte non confrontabili: controlla a mano con vercel inspect --logs");
  process.exit(0);
}

// `primaRotte` e `dopoRotte` sono mappe percorso → peso: si confrontano le
// **chiavi**, non le coppie, se no ogni rotta risulta sparita e nuova insieme
const sparite = [...primaRotte.keys()].filter((r) => !dopoRotte.has(r));
const nuove = [...dopoRotte.keys()].filter((r) => !primaRotte.has(r));
// stessa rotta, peso diverso: è qui che si vede se qualcuno ha lavorato sulle
// stesse pagine. Non è un sospetto: un componente condiviso muove il peso anche
// di pagine che non hai toccato. È la lista di cosa guardare col browser.
const cambiate = [...dopoRotte.entries()].filter(
  ([r, peso]) =>
    peso && primaRotte.get(r) && primaRotte.get(r) !== "" && primaRotte.get(r) !== peso,
);

if (nuove.length > 0) console.log(`\n+ rotte nuove: ${nuove.join(", ")}`);
if (cambiate.length > 0) {
  console.log(
    `\n~ rotte che hanno cambiato peso (guarda queste se un'altra sessione le stava toccando):\n  ${cambiate
      .map(([r, peso]) => `${r}  ${primaRotte.get(r)} → ${peso}`)
      .join("\n  ")}`,
  );
}

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

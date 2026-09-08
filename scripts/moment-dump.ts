/**
 * Guarda tutte le ricette senza aspettare che piova.
 *
 *   pnpm tsx --conditions=react-server --env-file=.env.local scripts/moment-dump.ts
 *   pnpm tsx --conditions=react-server --env-file=.env.local scripts/moment-dump.ts domenica-pioggia
 *
 * Senza argomenti stampa quale momento vince in una dozzina di scenari; con la chiave
 * di una ricetta stampa i primi titoli che TMDB le dà (senza personalizzazione: qui
 * non c'è una sessione, e l'affinità è quella di un profilo vuoto).
 */

import { contextAt, type Meteo } from "../src/lib/moment/context";
import {
  MOMENTI,
  MOODS,
  SEMPRE,
  pickMoment,
  type Recipe,
} from "../src/lib/moment/recipes";
import { genreIdsFor } from "../src/lib/home/hero-rank";
import { discoverForRecipe } from "../src/lib/tmdb/client";
import { searchResultTitle, searchResultYear } from "../src/lib/tmdb/mappers";

interface Scenario {
  nome: string;
  quando: string;
  meteo: Meteo | null;
}

const SCENARI: Scenario[] = [
  { nome: "domenica di pioggia, sera", quando: "2026-06-21T19:00:00Z", meteo: "pioggia" },
  { nome: "martedì sera", quando: "2026-06-23T19:00:00Z", meteo: "sereno" },
  { nome: "martedì notte", quando: "2026-06-23T22:00:00Z", meteo: "sereno" },
  { nome: "venerdì aperitivo", quando: "2026-06-26T16:30:00Z", meteo: "sereno" },
  { nome: "mercoledì pausa pranzo", quando: "2026-06-24T11:00:00Z", meteo: "sereno" },
  { nome: "sabato sera", quando: "2026-06-27T19:30:00Z", meteo: "sereno" },
  { nome: "sabato mattina", quando: "2026-06-27T07:30:00Z", meteo: "sereno" },
  { nome: "pomeriggio di pioggia", quando: "2026-04-15T13:00:00Z", meteo: "pioggia" },
  { nome: "sera d'estate", quando: "2026-07-14T19:00:00Z", meteo: "caldo" },
  { nome: "gennaio gelido", quando: "2026-01-14T16:00:00Z", meteo: "freddo" },
  { nome: "senza posizione, pomeriggio", quando: "2026-03-10T14:00:00Z", meteo: null },
];

function ricettaDi(key: string): Recipe | null {
  if (key === SEMPRE.key) return SEMPRE;
  return (
    MOMENTI.find((m) => m.recipe.key === key)?.recipe ??
    MOODS.find((m) => m.key === key) ??
    null
  );
}

async function main() {
  const key = process.argv[2];
  if (!key) {
    for (const s of SCENARI) {
      const c = contextAt(new Date(s.quando), s.meteo);
      const r = pickMoment(c);
      const ctx = `${String(c.ora).padStart(2, "0")}:00 g${c.giorno} m${c.mese} ${c.meteo ?? "-"}`;
      console.log(`${s.nome.padEnd(30)} ${ctx.padEnd(24)} → ${r.key}  "${r.titolo}"`);
    }
    const chiavi = [
      ...MOMENTI.map((m) => m.recipe.key),
      SEMPRE.key,
      ...MOODS.map((m) => m.key),
    ];
    console.log(`\nRicette disponibili: ${chiavi.join(", ")}`);
    return;
  }

  const recipe = ricettaDi(key);
  if (!recipe) {
    console.error(`Ricetta "${key}" sconosciuta.`);
    process.exit(1);
  }
  console.log(`${recipe.key} — "${recipe.titolo}"\n`);
  for (const type of ["movie", "tv"] as const) {
    const page = await discoverForRecipe(type, {
      generi: genreIdsFor(type, recipe.generi),
      senzaGeneri: recipe.senzaGeneri ? genreIdsFor(type, recipe.senzaGeneri) : undefined,
      keyword: recipe.keyword,
      runtimeMax: recipe.runtimeMax,
      runtimeMin: recipe.runtimeMin,
    }).catch(() => null);
    console.log(`— ${type} (${page?.total_results ?? 0} in totale)`);
    for (const r of (page?.results ?? []).slice(0, 12)) {
      console.log(`   ${searchResultTitle(r)}  ${searchResultYear(r) ?? "-"}`);
    }
    console.log();
  }
}

void main();

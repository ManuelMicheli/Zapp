/**
 * Genera `src/data/now-episodes.json`: per ogni nome di episodio del catalogo
 * NOW Italia, la serie a cui appartiene.
 *
 *   pnpm tsx --env-file=.env.local scripts/build-now-episodes.ts
 *
 * **Perché serve.** Sulla TV, NOW pubblica nella `MediaSession` il nome
 * dell'**episodio** e non quello della serie (misurato sulla Fire TV il
 * 12/09/2026: guardando *Atomic* diceva `Al Britani`). Cercare quel testo su
 * TMDB come se fosse un'opera non funziona e non puo' funzionare. L'unica
 * chiave che resta e' il nome dell'episodio, che va cercato al contrario:
 * dall'episodio alla serie.
 *
 * **Perché un indice e non una domanda a TMDB.** TMDB non sa cercare per nome
 * di episodio: si puo' solo scorrere le stagioni serie per serie. NOW Italia
 * pero' e' piccolo — 375 serie — quindi l'indice si costruisce in qualche
 * minuto e si rilegge in memoria.
 *
 * **Cosa NON entra nell'indice**, e il perché conta più di cosa ci entra:
 * - i nomi generici (`Episodio 7`, `Puntata 3`): stanno in centinaia di serie e
 *   non distinguono niente;
 * - i nomi che appartengono a piu' serie con la **stessa** durata: ambigui, e un
 *   ambiguo risolto a caso e' peggio di un titolo non riconosciuto, perche'
 *   scrive in libreria qualcosa che l'utente non ha visto.
 */

import { writeFileSync } from "node:fs";

const TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN;
if (!TOKEN || TOKEN.startsWith("INSERISCI")) {
  throw new Error("Manca TMDB_API_READ_ACCESS_TOKEN");
}

/** NOW su TMDB, region IT. */
const PROVIDER_NOW = 39;
/** Fra una richiesta e l'altra: TMDB regge di piu', ma non c'e' fretta. */
const PAUSA_MS = 120;

interface Riga {
  /** id TMDB della serie */
  s: number;
  /** stagione */
  n: number;
  /** episodio */
  e: number;
  /** durata in minuti, quando TMDB la conosce */
  d: number | null;
}

async function tmdb<T>(percorso: string): Promise<T> {
  for (let tentativo = 0; tentativo < 4; tentativo += 1) {
    const r = await fetch(`https://api.themoviedb.org/3${percorso}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (r.ok) return (await r.json()) as T;
    // 429: TMDB chiede di rallentare. Gli altri codici si ritentano lo stesso,
    // una volta ogni due secondi, perche' su mille richieste qualcuna cade.
    await pausa(2000 * (tentativo + 1));
  }
  throw new Error(`TMDB non risponde: ${percorso}`);
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Come si confronta un nome: senza accenti, senza punteggiatura, minuscolo. */
export function normalizza(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Un nome che non identifica niente: sta in centinaia di serie. */
export function nomeGenerico(nome: string): boolean {
  const n = normalizza(nome);
  if (n.length < 3) return true;
  return /^(episodio|episode|puntata|capitolo|parte|part|ep)\s*\d*$/.test(n);
}

async function serieDiNow(): Promise<number[]> {
  const ids: number[] = [];
  let pagina = 1;
  let pagine = 1;
  while (pagina <= pagine && pagina <= 500) {
    const r = await tmdb<{ page: number; total_pages: number; results: { id: number }[] }>(
      `/discover/tv?language=it-IT&watch_region=IT&with_watch_providers=${PROVIDER_NOW}&page=${pagina}`,
    );
    pagine = r.total_pages;
    for (const s of r.results) ids.push(s.id);
    process.stdout.write(`\rserie: ${ids.length} (pagina ${pagina}/${pagine})   `);
    pagina += 1;
    await pausa(PAUSA_MS);
  }
  process.stdout.write("\n");
  return ids;
}

async function main() {
  const ids = await serieDiNow();
  const indice = new Map<string, Riga[]>();
  let fatte = 0;

  for (const id of ids) {
    fatte += 1;
    process.stdout.write(`\rstagioni: ${fatte}/${ids.length}   `);
    try {
      const serie = await tmdb<{ seasons: { season_number: number }[] }>(
        `/tv/${id}?language=it-IT`,
      );
      await pausa(PAUSA_MS);
      for (const st of serie.seasons) {
        // La stagione 0 sono gli speciali: non e' cio' che si guarda di seguito.
        if (st.season_number < 1) continue;
        const dati = await tmdb<{
          episodes: { episode_number: number; name: string; runtime: number | null }[];
        }>(`/tv/${id}/season/${st.season_number}?language=it-IT`);
        await pausa(PAUSA_MS);
        for (const ep of dati.episodes ?? []) {
          if (!ep.name || nomeGenerico(ep.name)) continue;
          const chiave = normalizza(ep.name);
          const righe = indice.get(chiave) ?? [];
          righe.push({ s: id, n: st.season_number, e: ep.episode_number, d: ep.runtime });
          indice.set(chiave, righe);
        }
      }
    } catch (err) {
      // Una serie che non si legge non ferma l'indice: si perde lei.
      console.error(`\nserie ${id}: ${(err as Error).message}`);
    }
  }
  process.stdout.write("\n");

  const uscita: Record<string, Riga[]> = {};
  let ambigui = 0;
  for (const [chiave, righe] of indice) {
    // Lo stesso nome nella stessa serie (episodi ripetuti fra stagioni) non e'
    // ambiguo: lo e' solo fra serie diverse.
    const serieDiverse = new Set(righe.map((r) => r.s));
    if (serieDiverse.size > 1) {
      const durate = new Set(righe.map((r) => r.d ?? -1));
      // Nomi uguali in serie diverse: si tengono solo se le durate li separano.
      if (durate.size !== righe.length) {
        ambigui += 1;
        continue;
      }
    }
    uscita[chiave] = righe;
  }

  const percorso = "src/data/now-episodes.json";
  writeFileSync(percorso, JSON.stringify(uscita), "utf8");
  console.log(
    `\n${Object.keys(uscita).length} nomi in ${percorso} ` +
      `(${ambigui} scartati perche' ambigui, ${ids.length} serie lette)`,
  );
}

main();

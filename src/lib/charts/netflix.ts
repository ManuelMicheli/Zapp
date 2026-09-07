import "server-only";

import { latestWeek, parseTudumRow, type TudumRow } from "./netflix-parse";

const URL_TUDUM = "https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv";
// Senza uno User-Agent da browser Netflix risponde 403 (verificato 2026-09-07).
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TIMEOUT_MS = 45_000;

/**
 * Le sole righe italiane dell'ultima settimana pubblicata.
 *
 * Il file pesa 31 MB (circa 5 con gzip) e va letto **a flusso**: un `res.text()`
 * porterebbe tutto in memoria dentro una funzione che ne ha poca. Si tiene solo ciò
 * che serve — le righe che cominciano per `Italy\tIT\t` — e alla fine si filtra la
 * settimana più recente.
 */
export async function fetchNetflixItaly(): Promise<TudumRow[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(URL_TUDUM, {
      headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok || !res.body) {
      console.error(`[netflix] ${res.status} sul TSV di Tudum`);
      return [];
    }

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    const italian: TudumRow[] = [];
    let carry = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      carry += value;
      let cut = carry.indexOf("\n");
      while (cut !== -1) {
        const line = carry.slice(0, cut);
        carry = carry.slice(cut + 1);
        if (line.startsWith("Italy\t")) {
          const row = parseTudumRow(line);
          if (row && row.countryIso2 === "IT") italian.push(row);
        }
        cut = carry.indexOf("\n");
      }
    }
    if (carry.startsWith("Italy\t")) {
      const row = parseTudumRow(carry);
      if (row && row.countryIso2 === "IT") italian.push(row);
    }

    const week = latestWeek(italian);
    const rows = week ? italian.filter((r) => r.week === week) : [];
    console.log(
      `[netflix] settimana ${week ?? "?"}: ${rows.length} righe IT in ${Date.now() - started} ms`,
    );
    return rows;
  } catch (e) {
    console.error(`[netflix] errore dopo ${Date.now() - started} ms:`, e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

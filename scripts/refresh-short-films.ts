/**
 * Rinfresca i numeri di `src/data/short-films.json` contro YouTube.
 *
 *   pnpm tsx --env-file=.env.local scripts/refresh-short-films.ts [--scrivi]
 *
 * Il catalogo (quali corti, con che titolo e che trama) e' curato a mano e
 * questo script **non lo tocca**: aggiorna solo cio' che invecchia da solo — durata,
 * anno, canale, visualizzazioni, esistenza della copertina HD — e segnala i corti che
 * non si possono piu' riprodurre, che sono l'unica cosa che rompe la sezione davvero.
 *
 * Senza `--scrivi` non modifica niente: stampa cosa cambierebbe. E' il modo giusto di
 * usarlo la prima volta.
 *
 * Costo: un'unita' di quota YouTube ogni 50 corti, cioe' nove per un giro intero
 * (il tetto giornaliero del progetto e' 10.000). La stessa chiave di
 * `scripts/backfill-trailers.ts`.
 */

import { readFileSync, writeFileSync } from "node:fs";

interface Corto {
  slug: string;
  youtubeId: string;
  titolo: string;
  durata: number;
  anno: number;
  canale: string;
  canaleId: string;
  visualizzazioni: number;
  copertinaHd: boolean;
  [chiave: string]: unknown;
}

interface File {
  generato: string;
  fonte: string;
  corti: Corto[];
}

const PERCORSO = "src/data/short-films.json";
const scrivi = process.argv.includes("--scrivi");

const chiave = process.env.YOUTUBE_API_KEY;
if (!chiave || chiave.startsWith("INSERISCI")) {
  console.error("Manca YOUTUBE_API_KEY (vedi .env.example).");
  process.exit(1);
}

/** `PT3M41S` → 221. */
function secondi(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

interface VideoYouTube {
  id: string;
  snippet: {
    channelTitle: string;
    channelId: string;
    publishedAt: string;
    thumbnails: Record<string, unknown>;
  };
  statistics: { viewCount?: string };
  contentDetails: { duration: string };
  status: { embeddable: boolean; privacyStatus: string };
}

async function leggiVideo(ids: string[]): Promise<Map<string, VideoYouTube>> {
  const trovati = new Map<string, VideoYouTube>();
  for (let i = 0; i < ids.length; i += 50) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,statistics,contentDetails,status");
    url.searchParams.set("id", ids.slice(i, i + 50).join(","));
    url.searchParams.set("key", chiave!);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`YouTube ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { items?: VideoYouTube[] };
    for (const v of json.items ?? []) trovati.set(v.id, v);
  }
  return trovati;
}

async function main() {
  const file = JSON.parse(readFileSync(PERCORSO, "utf8")) as File;
  const video = await leggiVideo(file.corti.map((c) => c.youtubeId));

  const spariti: Corto[] = [];
  const bloccati: Corto[] = [];
  const cambi: string[] = [];

  for (const corto of file.corti) {
    const v = video.get(corto.youtubeId);
    if (!v) {
      spariti.push(corto);
      continue;
    }
    if (!v.status.embeddable || v.status.privacyStatus !== "public") {
      bloccati.push(corto);
      continue;
    }

    const nuovo = {
      durata: secondi(v.contentDetails.duration),
      anno: Number(v.snippet.publishedAt.slice(0, 4)),
      canale: v.snippet.channelTitle,
      canaleId: v.snippet.channelId,
      visualizzazioni: Number(v.statistics.viewCount ?? 0),
      copertinaHd: Boolean(v.snippet.thumbnails.maxres),
    };
    for (const [campo, valore] of Object.entries(nuovo)) {
      if (corto[campo] !== valore) {
        cambi.push(`${corto.titolo}: ${campo} ${String(corto[campo])} → ${String(valore)}`);
        (corto as Record<string, unknown>)[campo] = valore;
      }
    }
  }

  console.log(`${file.corti.length} corti, ${video.size} ancora su YouTube.`);
  if (spariti.length) {
    console.log(`\n${spariti.length} SPARITI (vanno sostituiti a mano):`);
    for (const c of spariti) console.log(`  ${c.titolo} — ${c.youtubeId}`);
  }
  if (bloccati.length) {
    console.log(`\n${bloccati.length} NON PIÙ RIPRODUCIBILI QUI (privati o senza embed):`);
    for (const c of bloccati) console.log(`  ${c.titolo} — ${c.youtubeId}`);
  }
  console.log(`\n${cambi.length} valori cambiati.`);
  for (const riga of cambi.slice(0, 40)) console.log(`  ${riga}`);
  if (cambi.length > 40) console.log(`  …e altri ${cambi.length - 40}.`);

  if (!scrivi) {
    console.log("\nProva a vuoto: niente scritto. Rilancia con --scrivi per salvare.");
    return;
  }
  file.generato = new Date().toISOString().slice(0, 10);
  writeFileSync(PERCORSO, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`\nScritto ${PERCORSO}.`);
}

void main();

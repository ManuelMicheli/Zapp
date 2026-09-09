/**
 * Guarda il popup dell'estensione senza doverlo installare.
 *
 *   node scripts/popup-shot.mjs [cartella-uscita]
 *
 * Il popup e' una pagina `chrome-extension://` e non si apre da Playwright:
 * qui si rende `extension/popup.html` in Chrome con un `chrome.*` finto e tre
 * stati salvati a mano (serie in riproduzione, film in pausa, titolo non
 * riconosciuto), e si salva uno screenshot per ciascuno. E' cosi' che si
 * ritara la copertina di sfondo e la barra del minutaggio: guardandole.
 *
 * Le copertine sono TMDB vere, quindi serve la rete. Lo `stub` va iniettato
 * come tag `<script>` e **non** con `addInitScript`: il `window.chrome` vero di
 * Chrome vince su quello, e la pagina resta muta.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXT = "extension";
const OUT = process.argv[2] ?? ".";

const html = readFileSync(join(EXT, "popup.html"), "utf8");
const js = readFileSync(join(EXT, "popup.js"), "utf8");

const scenari = [
  {
    nome: "serie",
    stato: {
      token: "t".repeat(40),
      corrente: {
        at: new Date(Date.now() - 4000).toISOString(),
        url: "https://www.netflix.com/watch/81480027",
        state: "playing",
        titleText: "Hajime no Ippo: The Fighting!E23Episodio 23",
        showText: "Hajime no Ippo: The Fighting!",
        pauseText: null,
        positionMs: 253_000,
        durationMs: 1_445_944,
      },
      ultima: {
        title: "Hajime no Ippo",
        posterPath: "/umMYjHm7FjsyllUnC8lWDy9rrZQ.jpg",
        backdropPath: "/uvCkSZwCTKnBtBOvDpcOvQA6xBg.jpg",
        season: 1,
        episode: 23,
        episodeName: "Episodio 23",
        completed: false,
      },
      ultimaUrl: "https://www.netflix.com/watch/81480027",
      ultimoInvio: { status: 200, applied: 1, ignored: 0, riconosciuto: true },
    },
  },
  {
    nome: "film-in-pausa",
    stato: {
      token: "t".repeat(40),
      corrente: {
        at: new Date().toISOString(),
        url: "https://www.netflix.com/watch/70232180",
        state: "paused",
        titleText: "Quasi amici",
        showText: null,
        pauseText: null,
        positionMs: 2_347_986,
        durationMs: 6_752_287,
      },
      ultima: {
        title: "Quasi amici - Intouchables",
        posterPath: "/ILg0AoyUlY5gpXGcMXNZS95FMG.jpg",
        backdropPath: "/q6OGlZ1KMEb14AC8KbPCxyNOal6.jpg",
        season: null,
        episode: null,
        episodeName: null,
        completed: false,
      },
      ultimaUrl: "https://www.netflix.com/watch/70232180",
      ultimoInvio: { status: 200, applied: 1, ignored: 0, riconosciuto: true },
    },
  },
  {
    nome: "non-riconosciuto",
    stato: {
      token: "t".repeat(40),
      corrente: {
        at: new Date().toISOString(),
        url: "https://www.netflix.com/watch/99999999",
        state: "playing",
        titleText: "Un titolo che TMDB non ha",
        showText: null,
        pauseText: null,
        positionMs: 61_000,
        durationMs: 3_600_000,
      },
      ultima: null,
      ultimaUrl: null,
      ultimoInvio: { status: 200, applied: 0, ignored: 1, riconosciuto: false },
    },
  },
];

const browser = await chromium.launch({ channel: "chrome" });
for (const { nome, stato } of scenari) {
  const page = await browser.newPage({ viewport: { width: 340, height: 400 } });
  page.on("console", (m) => console.log("   [console]", m.type(), m.text()));
  page.on("pageerror", (e) => console.log("   [errore]", e.message));
  await page.setContent(html.replace('<script src="popup.js"></script>', ""), {
    waitUntil: "domcontentloaded",
  });
  await page.addScriptTag({
    content: `window.chrome = {
      storage: { local: { get: (_k, cb) => cb(${JSON.stringify(stato)}) }, onChanged: { addListener: () => {} } },
      tabs: { query: async () => [], sendMessage: async () => {} },
    };`,
  });
  await page.addScriptTag({ content: js });
  await page.waitForTimeout(2500);
  const shot = join(OUT, `popup-${nome}.png`);
  await page.locator(".guscio").screenshot({ path: shot });
  console.log(shot);
  await page.close();
}
await browser.close();

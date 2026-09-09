// MAIN world: qui il DOM e' quello vero della pagina di Netflix (nel mondo
// ISOLATED delle content script, `document.querySelector` vedrebbe lo stesso
// DOM, ma qui e' anche dove vive `navigator.mediaSession`, se mai Netflix la
// popolasse). Non interpreta niente: manda le stringhe cosi' come sono, il
// contratto e' `RawEvent` in `src/lib/scrobble/types.ts`.
//
// Una sonda vera (2026-09-09, `src/lib/scrobble/__fixtures__/netflix.json`)
// ha dimostrato che Netflix NON popola `navigator.mediaSession`: title/
// artist/album restano sempre nulli. Il titolo vero viene da tre selettori
// DOM, letti qui sotto esattamente come li ha trovati la sonda.
(() => {
  const CANALE = "zapp-capture";
  const HEARTBEAT_MS = 30000;

  // L'unica "intelligenza" che sta nell'estensione, ed e' voluta: i tre
  // selettori spariscono dal DOM quando i comandi del player si nascondono
  // (successo in due battiti su nove nella sonda), quindi si ricorda l'ultima
  // stringa non vuota vista per l'id /watch/ corrente e la si rispedisce
  // finche' quell'id resta lo stesso. Al cambio di id la memoria si azzera
  // sempre: un episodio non deve mai ereditare il titolo di un altro.
  let watchId = null;
  let memoria = { titleText: null, showText: null, pauseText: null };

  function testo(el) {
    if (!el) return null;
    const t = (el.innerText || el.textContent || "").trim();
    return t || null;
  }

  function idDaUrl(url) {
    const m = /\/watch\/(\d+)/.exec(url);
    return m ? m[1] : null;
  }

  // Nota: `episode-preview-title` non si legge mai. E' l'anteprima
  // dell'episodio SUCCESSIVO mentre si guarda quello corrente: chi lo
  // spedisce fa scrivere il numero sbagliato (vedi ultima riga della sonda).
  function leggiSelettori() {
    return {
      titleText: testo(document.querySelector('[data-uia="video-title"]')),
      showText: testo(document.querySelector('[data-uia="video-title"] h4')),
      pauseText: testo(document.querySelector('[data-uia="pause-ad-title-display"]')),
    };
  }

  function stato() {
    const id = idDaUrl(location.href);
    // Si guarda solo dentro /watch/: fuori (/browse, /browse/genre/...) ci
    // sono <video> veri, le anteprime che partono da sole sfogliando il
    // catalogo, e una di esse nella sonda e' arrivata al 100%. Senza questo
    // filtro l'estensione segnerebbe come visto un trailer.
    if (!id) return null;

    if (id !== watchId) {
      watchId = id;
      memoria = { titleText: null, showText: null, pauseText: null };
    }

    const letti = leggiSelettori();
    if (letti.titleText) memoria.titleText = letti.titleText;
    if (letti.showText) memoria.showText = letti.showText;
    if (letti.pauseText) memoria.pauseText = letti.pauseText;

    const v = document.querySelector("video");
    const positionMs =
      v && Number.isFinite(v.currentTime) ? Math.round(v.currentTime * 1000) : null;
    const durationMs =
      v && Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : null;

    // Il battito esatto in cui parte l'episodio successivo: l'id e' gia'
    // cambiato ma il <video> non e' ancora arrivato (currentTime e duration
    // nulli). Niente posizione da riferire, niente evento: non si eredita la
    // posizione di un altro episodio.
    if (positionMs === null || durationMs === null) return null;

    const md = navigator.mediaSession && navigator.mediaSession.metadata;

    return {
      at: new Date().toISOString(),
      url: location.href,
      state: v.paused ? "paused" : "playing",
      // navigator.mediaSession: sempre nulla su Netflix (vedi sopra), tenuta
      // per contratto — la fonte vera sono i tre campi DOM sotto.
      title: md ? md.title || null : null,
      artist: md ? md.artist || null : null,
      album: md ? md.album || null : null,
      titleText: memoria.titleText,
      showText: memoria.showText,
      pauseText: memoria.pauseText,
      positionMs,
      durationMs,
    };
  }

  function manda(dati) {
    window.postMessage({ canale: CANALE, dati }, location.origin);
  }

  // Il battito periodico e' un `setTimeout` che si riprogramma da solo (non
  // un `setInterval` fisso) apposta: ogni evento di transizione lo riavvia,
  // cosi' non manda un doppione a distanza di pochi secondi dello stesso
  // stato appena spedito dalla transizione.
  let prossimoBattito = null;

  function pianificaBattito() {
    if (prossimoBattito) clearTimeout(prossimoBattito);
    prossimoBattito = setTimeout(() => {
      const s = stato();
      if (s) manda(s);
      pianificaBattito();
    }, HEARTBEAT_MS);
  }

  // Un evento di transizione: manda subito (non aspetta il prossimo
  // battito, che potrebbe arrivare fino a 30 s dopo) e riparte da qui col
  // battito periodico, per non doppiarlo.
  function transizione(overrides) {
    const s = stato();
    if (!s) return;
    manda(overrides ? { ...s, ...overrides } : s);
    pianificaBattito();
  }

  pianificaBattito();

  // `play`/`pause` non salgono a bolle (non "bubbla"no) fino a `document`,
  // ma si possono intercettare in fase di cattura: un solo listener su
  // `document` copre qualunque <video> Netflix crei o distrugga passando da
  // un episodio all'altro, senza doverlo ricercare a ogni cambio pagina.
  document.addEventListener("play", () => transizione(), true);
  document.addEventListener("pause", () => transizione(), true);
  // `ended`: il video ha finito per davvero (currentTime ~= duration), lo
  // stesso significato di "chiusura" di `pagehide` — sotto la soglia
  // COMPLETE_RATIO (0,9) ma sopra CLOSE_RATIO (0,85) e' proprio il caso che
  // altrimenti sfuggiva: un episodio lasciato all'87% e poi autoplayato non
  // veniva mai segnato visto, perche' senza questo evento `state: "stopped"`
  // non partiva mai se non alla chiusura vera della scheda.
  document.addEventListener("ended", () => transizione({ state: "stopped" }), true);

  // Scheda nascosta (cambio tab, minimizzata, sospesa da mobile): un altro
  // "ultimo respiro" oltre a `pagehide`, che su una SPA come Netflix non
  // scatta per la navigazione interna e su mobile puo' non scattare affatto
  // se il processo viene sospeso invece che terminato.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) transizione({ state: "stopped" });
  });

  // L'ultimo respiro: la scheda si chiude o passa in background per sempre.
  // Netflix e' una SPA, quindi `pagehide` non scatta per la navigazione
  // interna (browse -> watch e' un pushState, non un cambio di pagina vero).
  window.addEventListener("pagehide", () => transizione({ state: "stopped" }));
})();

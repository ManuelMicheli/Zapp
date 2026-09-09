// Gira nel MAIN world: qui `navigator.mediaSession.metadata` e' quella vera della pagina.
//
// Round 2 (2026-09-09): il primo giro ha mostrato che su Netflix web la mediaSession
// **non viene mai popolata** (title/artist/album nulli, playbackState "none" in tutte le
// righe). Quindi il titolo va letto dal DOM, e questa sonda serve a scoprire **quale**
// selettore lo porta davvero. Registriamo piu' candidati insieme, senza sceglierne uno.
(() => {
  const CANALE = "zconnection-probe";

  // Candidati per il titolo dentro il player. Nessuno e' garantito: li proviamo tutti e
  // guardiamo quale risponde. `data-uia` e' l'attributo che Netflix usa per i suoi test.
  const SELETTORI = [
    '[data-uia="video-title"]',
    '[data-uia="video-title"] h4',
    '[data-uia="player-title"]',
    '[data-uia="title-treatment-logo"]',
    ".video-title",
    ".ellipsize-text",
    "h4",
  ];

  function testo(el) {
    if (!el) return null;
    const t = (el.innerText || el.textContent || "").trim();
    return t ? t.slice(0, 300) : null;
  }

  /** Tutti gli elementi con un `data-uia` che contiene "title": rete a strascico. */
  function uiaTitoli() {
    const out = {};
    for (const el of document.querySelectorAll("[data-uia]")) {
      const uia = el.getAttribute("data-uia") || "";
      if (!uia.toLowerCase().includes("title")) continue;
      const t = testo(el);
      if (t && !out[uia]) out[uia] = t;
    }
    return out;
  }

  function istantanea() {
    const md = navigator.mediaSession && navigator.mediaSession.metadata;
    const v = document.querySelector("video");

    const selettori = {};
    for (const sel of SELETTORI) {
      const t = testo(document.querySelector(sel));
      if (t) selettori[sel] = t;
    }

    return {
      at: new Date().toISOString(),
      url: location.href,
      // mediaSession: la teniamo per conferma, ma il primo giro l'ha data sempre vuota
      title: md ? md.title : null,
      artist: md ? md.artist : null,
      album: md ? md.album : null,
      playbackState: navigator.mediaSession ? navigator.mediaSession.playbackState : null,
      // le due sorgenti che il primo giro ha dimostrato affidabili
      currentTime: v ? v.currentTime : null,
      duration: v ? v.duration : null,
      paused: v ? v.paused : null,
      // i candidati per il titolo
      documentTitle: document.title || null,
      selettori,
      uiaTitoli: uiaTitoli(),
      profilo: testo(document.querySelector('[data-uia*="profile"]')),
    };
  }

  setInterval(() => {
    window.postMessage({ canale: CANALE, dati: istantanea() }, location.origin);
  }, 5000);
})();

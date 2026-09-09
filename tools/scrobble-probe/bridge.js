// Gira nello ISOLATED world: sente i messaggi del main world e li accumula.
window.addEventListener("message", (e) => {
  // `e.origin` va controllato sempre: siamo dentro la pagina di un terzo.
  if (e.source !== window || e.origin !== location.origin) return;
  if (!e.data || e.data.canale !== "zconnection-probe") return;

  chrome.storage.local.get({ righe: [] }, ({ righe }) => {
    const ultima = righe[righe.length - 1];
    const nuova = e.data.dati;
    // salva solo quando cambia qualcosa di interessante, non ogni 5 secondi.
    // Round 2: si confrontano URL e candidati del titolo, perche' la mediaSession
    // su Netflix e' sempre vuota e non distingue piu' niente.
    const uguale =
      ultima &&
      ultima.url === nuova.url &&
      ultima.paused === nuova.paused &&
      ultima.documentTitle === nuova.documentTitle &&
      JSON.stringify(ultima.selettori) === JSON.stringify(nuova.selettori) &&
      JSON.stringify(ultima.uiaTitoli) === JSON.stringify(nuova.uiaTitoli) &&
      Math.abs((ultima.currentTime || 0) - (nuova.currentTime || 0)) < 120;
    if (uguale) return;
    chrome.storage.local.set({ righe: righe.concat([nuova]).slice(-400) });
  });
});

// ISOLATED world: sente il main world, parla col service worker, disegna il toast.
// Il service worker risponde nella callback: cosi' il toast si disegna qui e non
// serve il permesso `tabs` per raggiungere la scheda dall'esterno.
// Risponde all'adozione delle schede gia' aperte (`adottaSchedeAperte` in
// background.js): se questo listener c'e', gli script sono gia' dentro e non
// vanno iniettati una seconda volta.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "zapp-ping") {
    sendResponse({ ok: true });
    return false;
  }
  // Il popup si e' appena aperto e vuole la posizione esatta: il main world e'
  // l'unico che vede il <video>, quindi la richiesta gli arriva di la'.
  if (msg && msg.type === "zapp-refresh") {
    window.postMessage({ canale: "zapp-richiesta" }, location.origin);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

window.addEventListener("message", (e) => {
  // `e.origin` va controllato sempre: siamo dentro la pagina di un terzo, dove
  // gira anche codice che non e' nostro e potrebbe fingersi il main world.
  if (e.source !== window || e.origin !== location.origin) return;
  if (!e.data || e.data.canale !== "zapp-capture") return;

  chrome.runtime.sendMessage(
    { type: "evento", site: "netflix", dati: e.data.dati },
    (risposta) => {
      // l'estensione puo' essere stata disattivata a meta' pagina: senza
      // questo controllo `chrome.runtime.lastError` resta un errore silenzioso.
      if (chrome.runtime.lastError) return;
      if (risposta && risposta.card) mostraToast(risposta.card);
    },
  );
});

function mostraToast(card) {
  document.querySelector(".zapp-toast")?.remove();
  const el = document.createElement("div");
  el.className = "zapp-toast";

  if (card.posterPath) {
    const img = document.createElement("img");
    // `.src` e' una proprieta', non markup: nessun rischio di iniezione anche
    // se il valore contenesse caratteri strani.
    img.src = `https://image.tmdb.org/t/p/w92${card.posterPath}`;
    img.alt = "";
    el.appendChild(img);
  }

  // Testo sempre con textContent: niente HTML costruito con stringhe dentro
  // la pagina di un terzo, nemmeno per dati nostri.
  const box = document.createElement("div");
  const titolo = document.createElement("b");
  titolo.textContent = card.completed ? "Segnato su Zapp" : "Sto seguendo";
  const sotto = document.createElement("span");
  sotto.textContent =
    card.season && card.episode
      ? `${card.title} · S${card.season}:E${card.episode}`
      : card.title;
  box.append(titolo, sotto);
  el.appendChild(box);

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 6000);
}

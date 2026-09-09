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

  const idEvento = idDaUrl(e.data.dati.url);

  chrome.runtime.sendMessage(
    { type: "evento", site: "netflix", dati: e.data.dati },
    (risposta) => {
      // l'estensione puo' essere stata disattivata a meta' pagina: senza
      // questo controllo `chrome.runtime.lastError` resta un errore silenzioso.
      if (chrome.runtime.lastError) return;
      if (risposta && risposta.card && vaMostrato(idEvento, risposta.card)) {
        mostraToast(risposta.card);
      }
    },
  );
});

function idDaUrl(url) {
  const m = /\/watch\/(\d+)/.exec(url || "");
  return m ? m[1] : null;
}

/** Ultimo /watch/ per cui il toast e' gia' comparso, e per quale motivo. */
let toastFatto = { id: null, completato: false };

/**
 * Il toast serve a dire "l'estensione sta funzionando", e per dirlo basta una
 * volta: compariva a **ogni** battito, cioe' ogni 30 secondi e a ogni pausa,
 * diventando un fastidio sopra il player. Ora esce due volte al massimo per
 * ciascuna cosa che si guarda: quando comincia, e quando viene segnata come
 * vista — che e' un'altra informazione, non una ripetizione della prima.
 * Il conto si azzera da solo al cambio di `/watch/`, quindi ogni episodio nuovo
 * ha il suo.
 */
function vaMostrato(id, card) {
  if (!id) return false;
  if (id !== toastFatto.id) {
    toastFatto = { id, completato: Boolean(card.completed) };
    return true;
  }
  if (card.completed && !toastFatto.completato) {
    toastFatto.completato = true;
    return true;
  }
  return false;
}

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

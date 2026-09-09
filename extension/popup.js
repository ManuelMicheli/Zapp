// Popup dell'estensione: legge solo chrome.storage.local, nessuna rete qui
// tranne l'immagine di copertina. Dominio di produzione, stesso host di
// background.js. Per provare l'estensione contro un'app in locale (`pnpm dev`
// su localhost:3000), cambia SOLO questa riga.
const APP = "https://zapp-mu.vercel.app";

document.getElementById("apri-zapp").href = APP;

// Due fonti, non una. `corrente` e' cosa dice la **pagina** di Netflix, scritta
// dal service worker appena l'evento arriva: c'e' sempre quando qualcosa e' in
// riproduzione, anche se il server non ha risposto o non ha riconosciuto il
// titolo. `ultima` e' la card confermata dal server, con la copertina e il nome
// vero da TMDB: piu' bella, ma puo' mancare o riferirsi all'episodio di prima.
// Il popup mostra sempre la prima e ci appoggia sopra la seconda quando
// combaciano.
const CHIAVI = {
  token: null,
  corrente: null,
  ultima: null,
  ultimaUrl: null,
  ultimoInvio: null,
};

// Oltre questo tempo dall'ultimo evento non si sta piu' guardando niente: la
// pagina di Netflix e' chiusa, o gli script non ci sono. Il battito e' di 30 s.
const FRESCO_MS = 90_000;

/** Ultimo stato disegnato: lo legge il ciclo della barra a ogni fotogramma. */
let vista = null;

chrome.storage.local.get(CHIAVI, disegna);

// Il popup resta aperto mentre l'episodio va avanti: si ridisegna a ogni evento
// invece di mostrare una fotografia del momento in cui e' stato aperto.
chrome.storage.onChanged.addListener((cambi, area) => {
  if (area !== "local") return;
  if (!Object.keys(cambi).some((k) => k in CHIAVI)) return;
  chrome.storage.local.get(CHIAVI, disegna);
});

// Fra un battito e l'altro passano 30 secondi: appena il popup si apre si
// chiede alla pagina la posizione esatta, altrimenti la barra partirebbe da un
// minutaggio vecchio fino a mezzo minuto e poi salterebbe in avanti. Il giro e'
// popup -> bridge (isolated) -> capture (main), che rimanda subito un evento.
chiediPosizioneFresca();

async function chiediPosizioneFresca() {
  try {
    const schede = await chrome.tabs.query({ url: "https://www.netflix.com/*" });
    for (const scheda of schede) {
      if (!scheda.id) continue;
      // `.catch`: una scheda senza i nostri script non risponde, e non e' un
      // errore da mostrare — il popup ha gia' `corrente` da cui partire.
      chrome.tabs.sendMessage(scheda.id, { type: "zapp-refresh" }).catch(() => {});
    }
  } catch {
    // senza permesso host non c'e' niente da chiedere: si resta sull'ultimo noto
  }
}

function idDaUrl(url) {
  const m = /\/watch\/(\d+)/.exec(url || "");
  return m ? m[1] : null;
}

/** "1:23:45" o "4:07", come il player. */
function orologio(ms) {
  const tot = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(tot / 3600);
  const m = Math.floor((tot % 3600) / 60);
  const s = tot % 60;
  const due = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${due(m)}:${due(s)}` : `${m}:${due(s)}`;
}

/**
 * Dove si e' arrivati **adesso**, non all'ultimo battito.
 *
 * La pagina manda un evento ogni 30 s, quindi una barra disegnata sul solo
 * `positionMs` resterebbe ferma mezzo minuto e poi farebbe un salto. Qui si
 * somma il tempo passato da quell'evento — ma solo mentre si sta riproducendo:
 * in pausa la posizione e' quella e basta. Un salto avanti o indietro fatto
 * dall'utente non manda nessun evento, quindi la barra puo' restare disallineata
 * fino al battito successivo, che la rimette a posto da sola.
 */
function posizioneOra(corrente) {
  const base = corrente.positionMs ?? 0;
  if (corrente.state !== "playing") return base;
  const passato = Date.now() - Date.parse(corrente.at);
  const stimata = base + Math.max(0, passato);
  return corrente.durationMs ? Math.min(stimata, corrente.durationMs) : stimata;
}

function disegna(dati) {
  const { token, corrente, ultima, ultimaUrl, ultimoInvio } = dati;
  const statoTesto = document.getElementById("stato-testo");
  const punto = document.getElementById("punto");
  const box = document.getElementById("contenuto");
  const sfondo = document.getElementById("sfondo");
  const velo = document.getElementById("velo");
  box.textContent = "";
  box.className = "";
  vista = null;

  if (!token) {
    sfondo.hidden = true;
    velo.hidden = true;
    punto.classList.remove("vivo");
    statoTesto.textContent = "Non collegato";
    box.className = "vuoto";
    box.textContent = 'Apri Zapp, Profilo, Dispositivi e premi "Collega questo browser".';
    return;
  }

  const eta = corrente ? Date.now() - Date.parse(corrente.at) : Infinity;
  const inCorso = corrente && eta < FRESCO_MS;

  if (!inCorso) {
    sfondo.hidden = true;
    velo.hidden = true;
    punto.classList.remove("vivo");
    statoTesto.textContent = "Collegato";
    box.className = "vuoto";
    box.append(
      riga("Niente in riproduzione. Fai partire qualcosa su Netflix e torna qui."),
      diagnosi(corrente, ultimoInvio),
    );
    return;
  }

  const inRiproduzione = corrente.state === "playing";
  statoTesto.textContent = inRiproduzione ? "Stai guardando" : "In pausa";
  punto.classList.toggle("vivo", inRiproduzione);

  // La card del server vale solo se parla dello stesso episodio che sta andando
  // adesso: dopo un cambio di episodio resta indietro di uno finche' il nuovo
  // non viene riconosciuto, e mostrarla sarebbe una bugia.
  const card = ultima && idDaUrl(ultimaUrl) === idDaUrl(corrente.url) ? ultima : null;

  // Copertina di sfondo. Il fotogramma 16:9 e non la locandina: il popup e'
  // largo e basso, una 2:3 andrebbe tagliata quasi tutta. Senza fotogramma si
  // ripiega sulla locandina, e senza nessuna delle due resta il fondo scuro.
  const immagine = card && (card.backdropPath || card.posterPath);
  if (immagine) {
    sfondo.src = `https://image.tmdb.org/t/p/w780${immagine}`;
    sfondo.hidden = false;
    velo.hidden = false;
  } else {
    sfondo.removeAttribute("src");
    sfondo.hidden = true;
    velo.hidden = true;
  }

  box.className = "corpo";

  // mai innerHTML: solo proprieta' e nodi creati a mano, anche per dati nostri.
  const titolo = document.createElement("span");
  titolo.className = "titolo";
  // Nome vero da TMDB se il server l'ha riconosciuto, altrimenti quello letto
  // dalla pagina: `showText` e' l'h4 pulito (solo serie), `titleText` e' il
  // titolo intero, che per un film e' gia' pulito.
  titolo.textContent =
    (card && card.title) || corrente.showText || corrente.titleText || "In riproduzione";

  const meta = document.createElement("span");
  meta.className = "meta";
  if (card && card.episode) {
    // Netflix senza pannello di pausa non espone la stagione (vedi capture.js):
    // un episodio senza `season` e' comunque un episodio, non un film.
    const episodio = card.season
      ? `S${card.season}:E${card.episode}`
      : `E${card.episode}`;
    meta.textContent = card.episodeName ? `${episodio} · ${card.episodeName}` : episodio;
  } else if (card) {
    meta.textContent = "Film";
  } else if (ultimoInvio && ultimoInvio.status === 200 && !ultimoInvio.riconosciuto) {
    // Il server ha risposto e non l'ha riconosciuto: dirlo. "Riconoscimento in
    // corso" qui sarebbe una bugia, e sotto la diagnosi diceva il contrario.
    meta.textContent = "Titolo non riconosciuto";
  } else {
    meta.textContent = "Riconoscimento in corso…";
  }

  box.append(titolo, meta);

  if (corrente.durationMs > 0 && corrente.positionMs != null) {
    const player = document.createElement("div");
    player.className = "player";

    const passato = document.createElement("span");
    passato.className = "tempo";

    const traccia = document.createElement("div");
    traccia.className = "traccia";
    const riempimento = document.createElement("div");
    riempimento.className = "riempimento";
    const pallino = document.createElement("div");
    pallino.className = "pallino";
    traccia.append(riempimento, pallino);

    const restante = document.createElement("span");
    restante.className = "tempo restante";

    player.append(passato, traccia, restante);
    box.appendChild(player);

    vista = { corrente, passato, riempimento, pallino, restante };
    aggiornaBarra();
  }

  if (!card) box.appendChild(diagnosi(corrente, ultimoInvio));
}

/**
 * Muove la barra. Gira a ogni fotogramma finche' il popup e' aperto: e' un
 * pannello di 340px che vive pochi secondi, non una pagina — e una barra che
 * scatta una volta al secondo si vede.
 */
function aggiornaBarra() {
  if (!vista) return;
  const { corrente, passato, riempimento, pallino, restante } = vista;
  const pos = posizioneOra(corrente);
  const quota = Math.min(1, Math.max(0, pos / corrente.durationMs));
  riempimento.style.width = `${quota * 100}%`;
  pallino.style.left = `${quota * 100}%`;
  passato.textContent = orologio(pos);
  // Il tempo che manca col meno davanti, come sul player.
  restante.textContent = `-${orologio(corrente.durationMs - pos)}`;
}

function ciclo() {
  aggiornaBarra();
  requestAnimationFrame(ciclo);
}
requestAnimationFrame(ciclo);

function riga(testo) {
  const p = document.createElement("p");
  p.className = "riga";
  p.textContent = testo;
  return p;
}

/**
 * Dice **dove** si e' fermata la catena, che sono tre guasti diversi con tre
 * rimedi diversi: gli eventi non partono dalla pagina (script non iniettati:
 * ricaricare la scheda), partono ma il server li scarta (titolo non
 * riconosciuto), oppure e' la rete. Senza, un popup vuoto non distingue fra
 * "non sto guardando niente" e "e' rotto".
 */
function diagnosi(corrente, ultimoInvio) {
  const p = document.createElement("p");
  p.className = "diagnosi";

  if (!corrente) {
    p.textContent =
      "Nessun segnale da Netflix. Se hai una scheda Netflix aperta, ricaricala (F5): " +
      "gli script entrano quando la pagina si carica.";
    return p;
  }
  if (!ultimoInvio) {
    p.textContent = "Eventi raccolti ma non ancora inviati.";
    return p;
  }
  if (ultimoInvio.errore) {
    p.textContent = `Invio non riuscito: ${ultimoInvio.errore}. Riprova da solo.`;
    return p;
  }
  if (ultimoInvio.status === 401) {
    p.textContent = "Dispositivo scollegato da Zapp. Ricollegalo da Profilo, Dispositivi.";
    return p;
  }
  if (ultimoInvio.status !== 200) {
    p.textContent = `Il server ha risposto ${ultimoInvio.status}.`;
    return p;
  }
  if (!ultimoInvio.riconosciuto) {
    p.textContent =
      "Inviato, ma questo titolo non è stato riconosciuto: non finirà in libreria.";
    return p;
  }
  p.textContent = "Inviato.";
  return p;
}

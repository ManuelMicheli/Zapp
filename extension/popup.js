// Popup dell'estensione: legge solo chrome.storage.local, nessuna rete qui
// tranne l'immagine di copertina. Dominio di produzione, stesso host di
// background.js. Per provare l'estensione contro un'app in locale (`pnpm dev`
// su localhost:3000), cambia SOLO questa riga.
const APP = "https://zapp-mu.vercel.app";

document.getElementById("apri-zapp").href = APP;

// Il collegamento resta salvato; questo consenso serve solo se Chrome ha
// limitato Netflix a "al clic". Non richiede accesso ad altri siti.
const automatico = document.createElement("a");
automatico.href = "#";
automatico.className = "apri";
automatico.textContent = "Attiva il riconoscimento automatico";
automatico.hidden = true;
document.getElementById("apri-zapp").before(automatico);
const netflixPermission = { origins: ["https://www.netflix.com/*", "https://www.primevideo.com/*", "https://primevideo.com/*", "https://www.nowtv.it/*", "https://nowtv.it/*", "https://www.disneyplus.com/*", "https://disneyplus.com/*"] };
chrome.permissions.contains(netflixPermission).then((ok) => {
  automatico.hidden = ok;
});
automatico.addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    const ok = await chrome.permissions.request(netflixPermission);
    automatico.hidden = ok;
    if (ok) chiediPosizioneFresca();
  } catch {
    automatico.textContent =
      "Consenti accesso alle piattaforme nelle impostazioni dell'estensione";
  }
});

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
  ultimaContentKey: null,
  ultimoInvio: null,
};

// Oltre questo tempo dall'ultimo evento non si sta piu' guardando niente: la
// pagina di Netflix e' chiusa, o gli script non ci sono. Il battito e' di 30 s.
const popupModel = globalThis.ZConnectionPopup;

/** Ultimo stato disegnato: il ciclo aggiorna solo i valori realmente cambiati. */
let vista = null;
let ultimoFotogramma = null;
let cicloTimer = null;

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
    const schede = await chrome.tabs.query({ url: ["https://www.netflix.com/*", "https://www.primevideo.com/*", "https://primevideo.com/*", "https://www.nowtv.it/*", "https://nowtv.it/*", "https://www.disneyplus.com/*", "https://disneyplus.com/*"] });
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
 * dall'utente viene corretto dal prossimo campione del player.
 */
function posizioneOra(corrente) {
  return popupModel.position(corrente);
}

function disegna(dati) {
  if (cicloTimer !== null) {
    clearTimeout(cicloTimer);
    cicloTimer = null;
  }
  const { token, corrente, ultima, ultimaUrl, ultimaContentKey, ultimoInvio } = dati;
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

  const inCorso = corrente && popupModel.fresh(corrente);

  if (!inCorso) {
    sfondo.hidden = true;
    velo.hidden = true;
    punto.classList.remove("vivo");
    statoTesto.textContent = "Collegato";
    box.className = "vuoto";
    box.append(
      riga("La tua prossima visione ti aspetta. Avvia un titolo su una piattaforma collegata."),
      diagnosi(corrente, ultimoInvio),
    );
    return;
  }

  const inRiproduzione = corrente.state === "playing";
  statoTesto.textContent = inRiproduzione ? "In riproduzione" : corrente.state === "stopped" ? "Terminato" : "In pausa";
  punto.classList.toggle("vivo", inRiproduzione);

  // La card del server vale solo se parla dello stesso episodio che sta andando
  // adesso: dopo un cambio di episodio resta indietro di uno finche' il nuovo
  // non viene riconosciuto, e mostrarla sarebbe una bugia.
  const card = ultima && popupModel.sameContent(corrente, ultimaUrl, ultimaContentKey) ? ultima : null;

  // Copertina di sfondo. Il fotogramma 16:9 e non la locandina: il popup e'
  // largo e basso, una 2:3 andrebbe tagliata quasi tutta. Senza fotogramma si
  // ripiega sulla locandina, e senza nessuna delle due resta il fondo scuro.
  const immagine = card && (card.backdropPath || card.posterPath);
  sfondo.onerror = () => { sfondo.hidden = true; velo.hidden = true; };
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
    (card && card.title) || corrente.showText || corrente.titleText || corrente.raw?.titleText || "In riproduzione";

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
  } else if (!corrente.contentKey && ultimoInvio && ultimoInvio.status === 200 && !ultimoInvio.riconosciuto) {
    // Il server ha risposto e non l'ha riconosciuto: dirlo. "Riconoscimento in
    // corso" qui sarebbe una bugia, e sotto la diagnosi diceva il contrario.
    meta.textContent = "Titolo non riconosciuto";
  } else {
    meta.textContent = "Riconoscimento in corso…";
  }

  const piattaforma = document.createElement("span");
  piattaforma.className = "piattaforma";
  piattaforma.textContent = popupModel.platform(corrente.url).name;
  if (!card && corrente.raw?.detailText) meta.textContent = corrente.raw.detailText;
  box.append(piattaforma, titolo, meta);

  if (corrente.durationMs > 0 && corrente.positionMs != null) {
    const player = document.createElement("div");
    player.className = "player";

    const passato = document.createElement("span");
    passato.className = "tempo";

    const traccia = document.createElement("div");
    traccia.className = "traccia";
    traccia.setAttribute("role", "progressbar");
    traccia.setAttribute("aria-label", "Progresso della visione");
    traccia.setAttribute("aria-valuemin", "0");
    traccia.setAttribute("aria-valuemax", "100");
    const riempimento = document.createElement("div");
    riempimento.className = "riempimento";
    const pallino = document.createElement("div");
    pallino.className = "pallino";
    traccia.append(riempimento, pallino);

    const restante = document.createElement("span");
    restante.className = "tempo restante";

    player.append(passato, traccia, restante);
    box.appendChild(player);

    vista = { corrente, passato, riempimento, pallino, restante, traccia };
    ultimoFotogramma = null;
    aggiornaBarra();
    ciclo();
  }

  if (!card) box.appendChild(corrente.contentKey
    ? Object.assign(riga("In attesa del riconoscimento su Zapp"), {className: "diagnosi"})
    : diagnosi(corrente, ultimoInvio));
  else {
    const sincronizzazione = riga("Titolo collegato a Zapp");
    sincronizzazione.className = "diagnosi";
    box.appendChild(sincronizzazione);
  }
}

/**
 * Muove la barra. Gira a ogni fotogramma finche' il popup e' aperto: e' un
 * pannello di 340px che vive pochi secondi, non una pagina — e una barra che
 * scatta una volta al secondo si vede.
 */
function aggiornaBarra() {
  if (!vista) return;
  const { corrente, passato, riempimento, pallino, restante, traccia } = vista;
  if (!popupModel.fresh(corrente)) {
    vista = null;
    chrome.storage.local.get(CHIAVI, disegna);
    return;
  }
  const pos = posizioneOra(corrente);
  const quota = Math.min(1, Math.max(0, pos / corrente.durationMs));
  const percentuale = `${quota * 100}%`;
  const aria = String(Math.round(quota * 100));
  const trascorso = orologio(pos);
  // Il tempo che manca col meno davanti, come sul player.
  const manca = `-${orologio(corrente.durationMs - pos)}`;
  const prossimo = [percentuale, aria, trascorso, manca];
  if (ultimoFotogramma?.every((valore, indice) => valore === prossimo[indice])) return;
  if (ultimoFotogramma?.[0] !== percentuale) {
    riempimento.style.width = percentuale;
    pallino.style.left = percentuale;
  }
  if (ultimoFotogramma?.[1] !== aria) traccia.setAttribute("aria-valuenow", aria);
  if (ultimoFotogramma?.[2] !== trascorso) passato.textContent = trascorso;
  if (ultimoFotogramma?.[3] !== manca) restante.textContent = manca;
  ultimoFotogramma = prossimo;
}

function ciclo() {
  cicloTimer = null;
  if (document.hidden || !vista) return;
  aggiornaBarra();
  if (!vista) return;
  if (vista.corrente.state === "playing") {
    cicloTimer = setTimeout(ciclo, 100);
    return;
  }
  const scadenza = Date.parse(vista.corrente.at) + 90000 - Date.now();
  cicloTimer = setTimeout(
    () => chrome.storage.local.get(CHIAVI, disegna),
    Math.max(100, scadenza + 25),
  );
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(cicloTimer);
    cicloTimer = null;
  } else if (cicloTimer === null && vista) ciclo();
});

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
      "Nessun segnale dal player. Se hai una piattaforma collegata aperta, ricaricala (F5): " +
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
    p.textContent =
      "Dispositivo scollegato da Zapp. Ricollegalo da Profilo, Dispositivi.";
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

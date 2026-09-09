// Popup dell'estensione: legge solo chrome.storage.local, nessuna rete qui.
// Dominio di produzione, stesso host di background.js. Per provare
// l'estensione contro un'app in locale (`pnpm dev` su localhost:3000),
// cambia SOLO questa riga.
const APP = "https://zapp-mu.vercel.app";

document.getElementById("apri-zapp").href = APP;

// Due fonti, non una. `corrente` e' cosa dice la **pagina** di Netflix, scritta
// dal service worker appena l'evento arriva: c'e' sempre quando qualcosa e' in
// riproduzione, anche se il server non ha risposto o non ha riconosciuto il
// titolo. `ultima` e' la card confermata dal server, con la copertina e il nome
// vero da TMDB: piu' bella, ma puo' mancare o riferirsi all'episodio di prima.
// Il popup mostra sempre la prima e ci appoggia sopra la seconda quando
// combaciano. Prima leggeva solo `ultima` e restava vuoto proprio mentre un
// episodio andava.
const CHIAVI = { token: null, corrente: null, ultima: null, ultimaUrl: null, ultimoInvio: null };

// Oltre questo tempo dall'ultimo evento non si sta piu' guardando niente: la
// pagina di Netflix e' chiusa, o gli script non ci sono. Il battito e' di 30 s.
const FRESCO_MS = 90_000;

chrome.storage.local.get(CHIAVI, disegna);

// Il popup resta aperto mentre l'episodio va avanti: si ridisegna da solo a
// ogni evento invece di mostrare una fotografia del momento in cui e' stato
// aperto.
chrome.storage.onChanged.addListener((cambi, area) => {
  if (area !== "local") return;
  if (!Object.keys(cambi).some((k) => k in CHIAVI)) return;
  chrome.storage.local.get(CHIAVI, disegna);
});

function idDaUrl(url) {
  const m = /\/watch\/(\d+)/.exec(url || "");
  return m ? m[1] : null;
}

function minuti(ms) {
  return Math.max(0, Math.round(ms / 60000));
}

function disegna({ token, corrente, ultima, ultimaUrl, ultimoInvio }) {
  const statoTesto = document.getElementById("stato-testo");
  const box = document.getElementById("contenuto");
  box.textContent = "";
  box.className = "";

  if (!token) {
    statoTesto.textContent = "Non collegato";
    box.className = "vuoto";
    box.textContent = 'Apri Zapp, Profilo, Dispositivi e premi "Collega questo browser".';
    return;
  }

  const eta = corrente ? Date.now() - Date.parse(corrente.at) : Infinity;
  const inCorso = corrente && eta < FRESCO_MS;

  if (!inCorso) {
    statoTesto.textContent = "Collegato";
    box.className = "vuoto";
    box.append(
      riga("Niente in riproduzione. Fai partire qualcosa su Netflix e torna qui."),
      diagnosi(corrente, ultimoInvio),
    );
    return;
  }

  statoTesto.textContent = corrente.state === "paused" ? "In pausa" : "Stai guardando";

  // La card del server vale solo se parla dello stesso episodio che sta
  // andando adesso: dopo un cambio di episodio resta indietro di uno finche'
  // il nuovo non viene riconosciuto, e mostrarla sarebbe una bugia.
  const cardValida = ultima && idDaUrl(ultimaUrl) === idDaUrl(corrente.url) ? ultima : null;

  box.className = "card";

  // mai innerHTML: solo proprieta' e nodi creati a mano, anche per dati nostri.
  if (cardValida && cardValida.backdropPath) {
    const img = document.createElement("img");
    img.src = `https://image.tmdb.org/t/p/w500${cardValida.backdropPath}`;
    img.alt = "";
    box.appendChild(img);
  }

  const corpo = document.createElement("div");
  corpo.className = "corpo";

  const titolo = document.createElement("span");
  titolo.className = "titolo";
  // Nome vero da TMDB se il server l'ha riconosciuto, altrimenti quello letto
  // dalla pagina: `showText` e' l'h4 pulito (solo serie), `titleText` e' il
  // titolo intero, che per un film e' gia' pulito.
  titolo.textContent =
    (cardValida && cardValida.title) || corrente.showText || corrente.titleText || "In riproduzione";

  const meta = document.createElement("span");
  meta.className = "meta";
  if (cardValida && cardValida.episode) {
    // Netflix senza pannello di pausa non espone la stagione (vedi
    // capture.js): un episodio senza `season` e' comunque un episodio, non
    // un film — altrimenti una serie normale, senza mai mettere in pausa,
    // mostrava "Film" sotto il titolo.
    const episodio = cardValida.season
      ? `S${cardValida.season}:E${cardValida.episode}`
      : `E${cardValida.episode}`;
    meta.textContent = cardValida.episodeName
      ? `${episodio} · ${cardValida.episodeName}`
      : episodio;
  } else if (cardValida) {
    meta.textContent = "Film";
  } else {
    // Riconoscimento non ancora arrivato: si dice cos'e', non si finge.
    meta.textContent = "Riconoscimento in corso…";
  }

  corpo.append(titolo, meta);

  // Minutaggio e barra: vengono dalla pagina, quindi ci sono sempre, anche
  // prima che il server abbia riconosciuto il titolo.
  if (corrente.durationMs > 0 && corrente.positionMs != null) {
    const quota = Math.min(1, Math.max(0, corrente.positionMs / corrente.durationMs));

    const tempo = document.createElement("span");
    tempo.className = "tempo";
    tempo.textContent = `${minuti(corrente.positionMs)} min di ${minuti(corrente.durationMs)}`;

    const barra = document.createElement("div");
    barra.className = "barra";
    const dentro = document.createElement("div");
    dentro.style.width = `${Math.max(2, Math.round(quota * 100))}%`;
    barra.appendChild(dentro);

    corpo.append(tempo, barra);
  }

  if (!cardValida) corpo.appendChild(diagnosi(corrente, ultimoInvio));

  box.appendChild(corpo);
}

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
      "Inviato, ma questo titolo non e' stato riconosciuto su TMDB: non finira' in libreria.";
    return p;
  }
  p.textContent = "Inviato.";
  return p;
}

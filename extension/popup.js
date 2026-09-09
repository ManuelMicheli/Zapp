// Popup dell'estensione: legge solo chrome.storage.local, nessuna rete qui.
// Dominio di produzione, stesso host di background.js. Per provare
// l'estensione contro un'app in locale (`pnpm dev` su localhost:3000),
// cambia SOLO questa riga.
const APP = "https://zapp-mu.vercel.app";

document.getElementById("apri-zapp").href = APP;

chrome.storage.local.get({ token: null, ultima: null }, ({ token, ultima }) => {
  const statoTesto = document.getElementById("stato-testo");
  const box = document.getElementById("contenuto");

  if (!token) {
    statoTesto.textContent = "Non collegato";
    box.className = "vuoto";
    box.textContent = 'Apri Zapp, Profilo, Dispositivi e premi "Collega questo browser".';
    return;
  }

  statoTesto.textContent = "Stai guardando";

  if (!ultima) {
    box.className = "vuoto";
    box.textContent =
      "Niente in riproduzione. Fai partire qualcosa su Netflix e torna qui.";
    return;
  }

  box.className = "card";

  // mai innerHTML: solo proprieta' e nodi creati a mano, anche per dati nostri.
  if (ultima.backdropPath) {
    const img = document.createElement("img");
    img.src = `https://image.tmdb.org/t/p/w500${ultima.backdropPath}`;
    img.alt = "";
    box.appendChild(img);
  }

  const corpo = document.createElement("div");
  corpo.className = "corpo";

  const titolo = document.createElement("span");
  titolo.className = "titolo";
  titolo.textContent = ultima.title ?? "";

  const meta = document.createElement("span");
  meta.className = "meta";
  if (ultima.episode) {
    // Netflix senza pannello di pausa non espone la stagione (vedi
    // capture.js): un episodio senza `season` e' comunque un episodio, non
    // un film — altrimenti una serie normale, senza mai mettere in pausa,
    // mostrava "Film" sotto il titolo.
    const episodio = ultima.season
      ? `S${ultima.season}:E${ultima.episode}`
      : `E${ultima.episode}`;
    meta.textContent = ultima.episodeName
      ? `${episodio} · ${ultima.episodeName}`
      : episodio;
  } else {
    meta.textContent = "Film";
  }

  corpo.append(titolo, meta);
  box.appendChild(corpo);
});

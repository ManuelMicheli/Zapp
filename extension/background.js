// Service worker: l'unico posto che parla con la rete. Capture e bridge non
// sanno niente dell'API di Zapp, passano solo dati.

// Dominio di produzione. Per provare l'estensione contro un'app in locale
// (`pnpm dev` su localhost:3000), cambia SOLO questa riga — deve restare
// comunque uno dei due host elencati in `externally_connectable` del manifest.
const APP = "https://zapp-mu.vercel.app";
const API = `${APP}/api/scrobble`;
const MAX_CODA = 200;
const LOTTO = 50;

// Appena installata apre da sola la pagina di collegamento — che sta su Zapp, non
// qui: li' la sessione dell'utente c'e' gia'. `chrome.tabs.create` non richiede il
// permesso `tabs` (serve solo per leggere le schede, che non facciamo mai).
chrome.runtime.onInstalled.addListener((dettagli) => {
  adottaSchedeAperte();
  if (dettagli.reason !== "install") return;
  chrome.tabs.create({ url: `${APP}/devices/connect` });
});

// Anche a ogni avvio del browser: le schede ripristinate da una sessione
// precedente non ripassano dal caricamento della pagina.
chrome.runtime.onStartup.addListener(() => adottaSchedeAperte());

/**
 * Chrome inietta le content script **solo quando una pagina si carica**: una
 * scheda Netflix gia' aperta al momento dell'installazione (o del ricaricamento
 * dell'estensione durante lo sviluppo) resta senza `capture.js` per sempre, e
 * l'utente non vede niente e non ha modo di capire perche'. Costava un giro
 * intero anche a noi durante la sonda. Qui le si adotta a mano.
 *
 * `chrome.scripting` rispetta `host_permissions`, quindi non tocca niente
 * fuori da Netflix. Se una scheda ha gia' gli script (installazione appena
 * fatta su una pagina appena aperta) l'iniezione doppia non fa danni:
 * `capture.js` e' una IIFE che si limiterebbe a piazzare un secondo battito,
 * e gli eventi sono stato assoluto, non delta — ma la si evita comunque
 * chiedendo prima alla scheda se risponde.
 */
async function adottaSchedeAperte() {
  let schede;
  try {
    schede = await chrome.tabs.query({ url: "https://www.netflix.com/*" });
  } catch {
    return; // senza il permesso host non c'e' niente da fare, e non e' un errore
  }
  for (const scheda of schede) {
    if (!scheda.id) continue;
    try {
      // Il bridge risponde a "zapp-ping": se c'e' gia', si lascia stare.
      const vivo = await chrome.tabs
        .sendMessage(scheda.id, { type: "zapp-ping" })
        .catch(() => null);
      if (vivo && vivo.ok) continue;

      await chrome.scripting.insertCSS({
        target: { tabId: scheda.id },
        files: ["toast.css"],
      });
      await chrome.scripting.executeScript({
        target: { tabId: scheda.id },
        files: ["capture.js"],
        world: "MAIN",
      });
      await chrome.scripting.executeScript({
        target: { tabId: scheda.id },
        files: ["bridge.js"],
        world: "ISOLATED",
      });
    } catch {
      // scheda scaricata, chiusa nel frattempo, o pagina di errore: si passa
      // alla prossima. Non c'e' niente da riferire all'utente.
    }
  }
}

// Il token arriva dalla pagina di Zapp con `chrome.runtime.sendMessage(extensionId,
// ...)`: solo le origini elencate in `externally_connectable` del manifest possono
// chiamare questo canale, e' Chrome a garantirlo prima ancora che il listener veda
// il messaggio.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "zapp-token" && typeof msg.token === "string" && msg.token) {
    chrome.storage.local.set({ token: msg.token }, () => sendResponse({ ok: true }));
    return true; // risposta asincrona
  }
  return false;
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "evento" || !msg.dati) return false;
  accoda({ id: crypto.randomUUID(), site: msg.site, ...msg.dati })
    .then((card) => sendResponse({ card }))
    .catch(() => sendResponse({ card: null }));
  return true; // risposta asincrona: il bridge disegna il toast nella callback
});

// `accoda`/`svuota` fanno leggi-modifica-scrivi su chrome.storage.local, non
// atomico: due chiamate ravvicinate (un evento nuovo mentre scatta
// l'allarme, o due schede Netflix aperte insieme — scenario normale, non di
// laboratorio) possono accavallarsi e perdere un pezzo di coda. Si
// serializzano qui in coda a una catena di promesse tenuta in una variabile
// di modulo: ogni chiamata aspetta la fine di quella precedente prima di
// leggere lo storage, così in questa istanza del worker non ne girano mai
// due insieme. Basta questo: se Chrome spegne il service worker non restano
// operazioni in volo da proteggere, e un lotto rispedito due volte non fa
// danni (gli eventi sono stato assoluto, la RPC lato server e' idempotente).
let coda_ = Promise.resolve();

function accoda(evento) {
  // `.catch(() => {})` prima del `.then`: un fallimento della chiamata
  // precedente non deve incastrare la catena, la prossima operazione parte
  // comunque.
  const p = coda_.catch(() => {}).then(() => accodaOra(evento));
  coda_ = p;
  return p;
}

function svuota() {
  const p = coda_.catch(() => {}).then(() => svuotaOra());
  coda_ = p;
  return p;
}

async function accodaOra(evento) {
  const { coda = [] } = await chrome.storage.local.get({ coda: [] });
  await chrome.storage.local.set({
    coda: coda.concat([evento]).slice(-MAX_CODA),
    // Cosa si sta guardando **secondo la pagina**, scritto prima di parlare
    // col server e indipendente da come andra' la richiesta. E' questo che il
    // popup mostra subito: la card del server arriva dopo, porta la copertina
    // e il nome vero da TMDB, e puo' non arrivare affatto (titolo non
    // riconosciuto, rete giu'). Senza, il popup restava vuoto proprio mentre
    // un episodio era in riproduzione.
    corrente: {
      at: evento.at,
      url: evento.url,
      state: evento.state,
      titleText: evento.titleText ?? null,
      showText: evento.showText ?? null,
      pauseText: evento.pauseText ?? null,
      positionMs: evento.positionMs ?? null,
      durationMs: evento.durationMs ?? null,
    },
  });
  return svuotaOra();
}

/** Ritorna la card dell'ultimo evento applicato, o null. */
async function svuotaOra() {
  const { token, coda = [] } = await chrome.storage.local.get({ token: null, coda: [] });
  if (!token || coda.length === 0) return null;

  const lotto = coda.slice(0, LOTTO);
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ events: lotto }),
    });
    await segnaEsito({ at: new Date().toISOString(), status: res.status });

    if (res.status === 401) {
      // il dispositivo e' stato scollegato da Zapp: si dimentica il token e la
      // coda, che non ha piu' modo di essere consegnata.
      await chrome.storage.local.set({ token: null, coda: [] });
      return null;
    }
    if (!res.ok) return null; // riprova al prossimo evento o al prossimo allarme

    const dati = await res.json();

    // Si toglie dalla coda solo cio' che e' appena stato spedito, per id — non
    // uno slice cieco: fra l'invio (che puo' restare in volo per un po', la
    // rete e' lenta) e questo momento puo' essere arrivato dell'altro (un
    // nuovo battito, un'altra scheda Netflix aperta), e uno slice per
    // posizione lo perderebbe.
    const inviati = new Set(lotto.map((e) => e.id));
    const { coda: attuale = [] } = await chrome.storage.local.get({ coda: [] });
    const rimasta = attuale.filter((e) => !inviati.has(e.id));

    // `ultima` si sovrascrive **solo con una card vera**. Prima era
    // `dati.card ?? null`: bastava un lotto senza card — un evento fuori da
    // /watch/, un titolo non riconosciuto, un battito arrivato in ritardo —
    // per cancellare la card buona di un attimo prima, e il popup tornava
    // "Niente in riproduzione" mentre l'episodio andava.
    const aggiornamento = { coda: rimasta };
    if (dati.card) {
      aggiornamento.ultima = dati.card;
      // A quale /watch/ si riferisce la card: serve al popup per sapere se la
      // copertina che ha in mano e' ancora quella dell'episodio in corso o e'
      // rimasta indietro di uno. Il server risponde con la card dell'ultimo
      // evento applicato del lotto, che e' l'ultimo della lista.
      aggiornamento.ultimaUrl = lotto[lotto.length - 1].url ?? null;
    }
    await chrome.storage.local.set(aggiornamento);

    await segnaEsito({
      at: new Date().toISOString(),
      status: res.status,
      applied: dati.applied ?? 0,
      ignored: dati.ignored ?? 0,
      riconosciuto: Boolean(dati.card),
    });

    return dati.card ?? null;
  } catch (e) {
    // niente rete: la coda resta e riparte dopo. Gli eventi sono stato
    // assoluto (posizione, non delta): un duplicato riapplicato non fa danni.
    await segnaEsito({ at: new Date().toISOString(), errore: String(e && e.message) });
    return null;
  }
}

/**
 * Esito dell'ultima richiesta, per il popup. Senza questo, un utente che non
 * vede niente non ha modo di sapere *dove* si e' fermata la catena — se gli
 * eventi non partono dalla pagina, se partono e il server li scarta, o se e'
 * la rete. Sono tre rimedi diversi.
 */
async function segnaEsito(esito) {
  await chrome.storage.local.set({ ultimoInvio: esito });
}

chrome.alarms.create("svuota", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => svuota());

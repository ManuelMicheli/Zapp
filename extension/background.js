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
  if (dettagli.reason !== "install") return;
  chrome.tabs.create({ url: `${APP}/devices/connect` });
});

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
  await chrome.storage.local.set({ coda: coda.concat([evento]).slice(-MAX_CODA) });
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
    await chrome.storage.local.set({ coda: rimasta, ultima: dati.card ?? null });
    return dati.card ?? null;
  } catch {
    // niente rete: la coda resta e riparte dopo. Gli eventi sono stato
    // assoluto (posizione, non delta): un duplicato riapplicato non fa danni.
    return null;
  }
}

chrome.alarms.create("svuota", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(() => svuota());

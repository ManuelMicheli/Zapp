// Service worker: l'unico posto che parla con la rete. Capture e bridge non
// sanno niente dell'API di Zapp, passano solo dati.

// Dominio di produzione. Per provare l'estensione contro un'app in locale
// (`pnpm dev` su localhost:3000), cambia SOLO questa riga: deve restare
// comunque uno dei due host elencati in `externally_connectable` del manifest.
const APP = "https://zapp-mu.vercel.app";
const API = `${APP}/api/scrobble`;
const MAX_CODA = 200;
const LOTTO = 50;
const PRIME_ORIGINS = ["https://www.primevideo.com/*", "https://primevideo.com/*"];
const DISNEY_ORIGINS = ["https://www.disneyplus.com/*", "https://disneyplus.com/*"];
const NOW_ORIGINS = ["https://www.nowtv.it/*", "https://nowtv.it/*"];
const ZAPP_ORIGINS = ["https://zapp-mu.vercel.app/*", "http://localhost:3000/*"];
const ALLARME_SVUOTA = "svuota";
const MAX_LOTTI_PER_RISVEGLIO = 4;

function siteOf(href) {
  try {
    const u = new URL(href);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
    if (u.hostname === "www.netflix.com") return "netflix";
    if (["www.primevideo.com", "primevideo.com"].includes(u.hostname)) return "prime";
    if (["www.disneyplus.com", "disneyplus.com"].includes(u.hostname)) return "disney";
    if (["www.nowtv.it", "nowtv.it"].includes(u.hostname)) return "now";
  } catch {
    /* Origine non valida. */
  }
  return null;
}

function cleanEvent(d, site) {
  if (!d || typeof d !== "object" || siteOf(d.url) !== site || typeof d.url !== "string" || d.url.length > 2000 ||
    !["playing", "paused", "stopped"].includes(d.state) || typeof d.at !== "string" || !Number.isFinite(Date.parse(d.at))) return null;
  const fields = ["title", "artist", "album", "titleText", "showText", "pauseText"];
  if (fields.some((k) => d[k] != null && (typeof d[k] !== "string" || d[k].length > 500))) return null;
  if (!Number.isFinite(d.positionMs) || d.positionMs < 0 || !Number.isFinite(d.durationMs) || d.durationMs <= 0) return null;
  if (["prime", "now", "disney"].includes(site) && (typeof d.contentKey !== "string" || !d.contentKey || d.contentKey.length > 1500)) return null;
  return {
    at: d.at,
    url: d.url,
    state: d.state,
    positionMs: d.positionMs,
    durationMs: d.durationMs,
    ...Object.fromEntries(fields.map((k) => [k, d[k] ?? null])),
    ...(["prime", "now", "disney"].includes(site) ? {
      contentKey: d.contentKey,
      playbackRate: Number.isFinite(d.playbackRate) && d.playbackRate > 0 ? d.playbackRate : 1,
    } : {}),
  };
}

// Coda locale separata dalla rete: una richiesta lenta non ferma il popup.
let liveQueue = Promise.resolve();
function updateLive(dati, sender) {
  const p = liveQueue.catch(() => {}).then(async () => {
    const previous = await chrome.storage.local.get({ corrente: null, correnteTabId: null });
    if (!dati && previous.correnteTabId !== sender.tab.id) return;
    if (dati && previous.correnteTabId !== sender.tab.id && previous.corrente?.state === "playing" &&
      Date.now() - Date.parse(previous.corrente.at) < 90000 && !sender.tab.active && dati.state !== "playing") return;
    await chrome.storage.local.set({ corrente: dati, correnteTabId: dati ? sender.tab.id : null });
  });
  liveQueue = p;
  return p;
}

// Appena installata apre da sola la pagina di collegamento: li' la sessione
// dell'utente c'e' gia'. `chrome.tabs.create` non richiede il permesso `tabs`.
chrome.runtime.onInstalled.addListener((dettagli) => {
  adottaSchedeAperte();
  if (dettagli.reason !== "install") return;
  chrome.tabs.create({ url: `${APP}/devices/connect` });
});

// Anche a ogni avvio del browser: le schede ripristinate da una sessione
// precedente non ripassano dal caricamento della pagina.
chrome.runtime.onStartup.addListener(() => adottaSchedeAperte());

async function adottaSchedeAperte() {
  await adottaSchedeZapp();
  let schede;
  try {
    schede = await chrome.tabs.query({ url: ["https://www.netflix.com/*", ...PRIME_ORIGINS, ...NOW_ORIGINS, ...DISNEY_ORIGINS] });
  } catch {
    return;
  }
  for (const scheda of schede) {
    if (!scheda.id) continue;
    try {
      const vivo = await chrome.tabs
        .sendMessage(scheda.id, { type: "zapp-ping" })
        .catch(() => null);
      if (vivo && vivo.ok) {
        await chrome.tabs
          .sendMessage(scheda.id, { type: "zapp-refresh" })
          .catch(() => {});
        continue;
      }

      if (siteOf(scheda.url) === "prime") {
        await chrome.scripting.executeScript({ target: { tabId: scheda.id }, files: ["adapters/prime.js", "prime-capture.js"], world: "ISOLATED" });
        continue;
      }
      if (siteOf(scheda.url) === "disney") {
        await chrome.scripting.executeScript({ target: { tabId: scheda.id }, files: ["adapters/disney.js", "disney-capture.js"], world: "ISOLATED" });
        continue;
      }
      if (siteOf(scheda.url) === "now") {
        await chrome.scripting.executeScript({ target: { tabId: scheda.id }, files: ["adapters/now.js", "now-capture.js"], world: "ISOLATED" });
        continue;
      }
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
      // Scheda scaricata, chiusa nel frattempo, o pagina di errore.
    }
  }
}

// Gli script dichiarati nel manifest entrano nelle nuove navigazioni; dopo un
// aggiornamento, invece, le schede Zapp gia' aperte possono non essere
// ricaricate. La reiniezione e' idempotente grazie al cleanup di zapp-sync.js.
async function adottaSchedeZapp() {
  let schede;
  try {
    schede = await chrome.tabs.query({ url: ZAPP_ORIGINS });
  } catch {
    return;
  }
  await Promise.all(schede.filter((scheda) => scheda.id).map((scheda) =>
    chrome.scripting.executeScript({
      target: { tabId: scheda.id },
      files: ["zapp-sync.js"],
      world: "ISOLATED",
    }).catch(() => {}),
  ));
}

// Le schede Zapp gia' aperte non ricevono un nuovo rendering quando il worker
// applica un evento. Il payload resta nel worker: alla pagina basta un segnale
// senza dati, cosi' sara' lei a rileggere la propria sessione.
async function notificaSchedeZapp() {
  let schede;
  try {
    schede = await chrome.tabs.query({ url: ZAPP_ORIGINS });
  } catch {
    return;
  }
  await Promise.all(schede.filter((scheda) => scheda.id).map((scheda) =>
    chrome.tabs.sendMessage(scheda.id, { type: "zapp-watch-updated" }).catch(() => {}),
  ));
}

// Il token arriva dalla pagina di Zapp con `chrome.runtime.sendMessage(extensionId,
// ...)`: solo le origini elencate in `externally_connectable` del manifest possono
// chiamare questo canale.
chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "zapp-token" && typeof msg.token === "string" && msg.token) {
    collegaToken(msg.token)
      .then(async () => {
        sendResponse({ ok: true });
        await adottaSchedeAperte();
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  return false;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !sender.tab?.id || sender.id !== chrome.runtime.id) return false;
  const site = siteOf(sender.url ?? sender.tab.url);
  if (!site || msg.site !== site) return false;
  if (["now", "disney"].includes(site) && sender.frameId !== 0) return false;
  if ((msg.type === "disney-live" && site === "disney") || (msg.type === "prime-live" && site === "prime") || (msg.type === "now-live" && site === "now")) {
    const dati = msg.dati === null ? null : cleanEvent(msg.dati, site);
    if (msg.dati !== null && !dati) return false;
    updateLive(dati, sender).then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type !== "evento") return false;
  const dati = cleanEvent(msg.dati, site);
  if (!dati) return false;
  accoda({ ...dati, id: crypto.randomUUID(), site, tabId: sender.tab.id })
    .then((card) => sendResponse({ card }))
    .catch(() => sendResponse({ card: null }));
  return true;
});

// Le mutazioni di `chrome.storage.local` restano serializzate: sono
// leggi-modifica-scrivi e non sono atomiche. La rete sta fuori da questa
// serratura, cosi' un POST lento non tiene in memoria gli eventi nuovi prima
// che vengano salvati su disco.
let coda_ = Promise.resolve();
let invio_ = null;

function accoda(evento) {
  return conStorage(() => accodaOra(evento))
    .then(() => svuota())
    .then((esito) => conStorage(() => cardPerEvento(evento, esito)));
}

function svuota() {
  if (invio_) return invio_;
  invio_ = svuotaOra().finally(() => {
    invio_ = null;
  });
  return invio_;
}

async function collegaToken(nuovoToken) {
  await conStorage(async () => {
    const { token } = await leggiStorage("token");
    if (token !== nuovoToken) {
      // Non attribuire la coda di un vecchio collegamento a un altro utente.
      await scriviStorage({
        token: nuovoToken,
        coda: [],
        corrente: null,
        ultima: null,
        ultimaUrl: null,
        ultimaContentKey: null,
        retryAt: 0,
        failures: 0,
      });
    }
    await aggiornaAllarmeDaStato();
  });
}

async function accodaOra(evento) {
  const { coda = [] } = await leggiStorage({ coda: [] });
  await scriviStorage({
    coda: coda.concat([evento]).slice(-MAX_CODA),
    // Cosa si sta guardando secondo la pagina, scritto prima di parlare col server.
    ...(!["prime", "now", "disney"].includes(evento.site) ? {
      correnteTabId: evento.tabId,
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
    } : {}),
  });
  await aggiornaAllarmeDaStato();
}

/** Ritorna la card dell'ultimo evento applicato, o null. */
async function svuotaOra() {
  let ultimoEsito = null;
  for (let giro = 0; giro < MAX_LOTTI_PER_RISVEGLIO; giro++) {
    const pronto = await conStorage(preparaInvio);
    if (!pronto) return ultimoEsito;

    const { token, lotto } = pronto;
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ events: lotto }),
        signal: AbortSignal.timeout(20_000),
      });

      if (res.status === 401) {
        await conStorage(() => scollegaSeTokenAttuale(token, res.status));
        return ultimoEsito;
      }
      if (!res.ok) {
        await conStorage(() => registraErroreInvio(token, { at: new Date().toISOString(), status: res.status }));
        return ultimoEsito;
      }

      const dati = await res.json();
      const applicata = await conStorage(() => applicaRisposta(token, lotto, res.status, dati));
      if (!applicata) return null;
      ultimoEsito = applicata.esito ?? ultimoEsito;
      if (!applicata.continua) return ultimoEsito;
    } catch (e) {
      await conStorage(() => registraErroreInvio(token, { at: new Date().toISOString(), errore: String(e && e.message) }));
      return ultimoEsito;
    }
  }
  await conStorage(aggiornaAllarmeDaStato);
  return ultimoEsito;
}

async function preparaInvio() {
  const { token, coda = [], retryAt = 0 } = await leggiStorage({ token: null, coda: [], retryAt: 0 });
  await aggiornaAllarmeDaStato({ token, coda, retryAt });
  if (!token || coda.length === 0 || Date.now() < retryAt) return null;
  return { token, lotto: coda.slice(0, LOTTO) };
}

async function scollegaSeTokenAttuale(tokenInvio, status) {
  const { token } = await leggiStorage({ token: null });
  if (token !== tokenInvio) return;
  await segnaEsito({ at: new Date().toISOString(), status });
  await scriviStorage({ token: null, coda: [], retryAt: 0, failures: 0 });
  await aggiornaAllarmeDaStato({ token: null, coda: [], retryAt: 0 });
}

async function registraErroreInvio(tokenInvio, esito) {
  const { token } = await leggiStorage({ token: null });
  if (token !== tokenInvio) return;
  await segnaEsito(esito);
  await rinvia();
}

async function applicaRisposta(tokenInvio, lotto, status, dati) {
  const { token, coda: attuale = [] } = await leggiStorage({ token: null, coda: [] });
  if (token !== tokenInvio) return null;

  await segnaEsito({ at: new Date().toISOString(), status });

  // Si toglie dalla coda solo cio' che e' appena stato spedito, per id.
  const supported = Array.isArray(dati.supportedSites) ? dati.supportedSites : [];
  const sentIds = new Set(lotto.filter((e) => !["prime", "now", "disney"].includes(e.site) || supported.includes(e.site)).map((e) => e.id));
  const inviati = new Set((Array.isArray(dati.acknowledged) ? dati.acknowledged : []).filter((id) => sentIds.has(id)));
  const rimasta = attuale.filter((e) => !inviati.has(e.id));

  const aggiornamento = { coda: rimasta };
  if (dati.card) {
    aggiornamento.ultima = dati.card;
    aggiornamento.ultimaUrl = dati.cardUrl ?? null;
    aggiornamento.ultimaContentKey = dati.cardContentKey ?? null;
  }
  await scriviStorage(aggiornamento);

  if (Number(dati.applied) > 0) await notificaSchedeZapp();

  const completo = lotto.every((e) => inviati.has(e.id));
  if (completo) await scriviStorage({ retryAt: 0, failures: 0 });
  else await rinvia();

  await segnaEsito({
    at: new Date().toISOString(),
    status,
    applied: dati.applied ?? 0,
    ignored: dati.ignored ?? 0,
    riconosciuto: Boolean(dati.card),
  });

  const retryAt = completo ? 0 : (await leggiStorage({ retryAt: 0 })).retryAt;
  await aggiornaAllarmeDaStato({ token, coda: rimasta, retryAt });
  return {
    esito: dati.card ? {
      token,
      card: dati.card,
      cardUrl: dati.cardUrl ?? null,
      cardContentKey: dati.cardContentKey ?? null,
    } : null,
    continua: completo && rimasta.length > 0 && Date.now() >= retryAt,
  };
}

/**
 * Esito dell'ultima richiesta, per il popup. Senza questo, un utente che non
 * vede niente non ha modo di sapere dove si e' fermata la catena.
 */
async function segnaEsito(esito) {
  await scriviStorage({ ultimoInvio: esito });
}

async function rinvia() {
  const { failures = 0 } = await leggiStorage({ failures: 0 });
  await scriviStorage({
    failures: Math.min(failures + 1, 5),
    retryAt: Date.now() + Math.min(300_000, 15_000 * 2 ** failures),
  });
  await aggiornaAllarmeDaStato();
}

function conStorage(fn) {
  const p = coda_.catch(() => {}).then(fn);
  coda_ = p;
  return p;
}

async function leggiStorage(defaults) {
  return chrome.storage.local.get(defaults);
}

async function scriviStorage(values) {
  return chrome.storage.local.set(values);
}

async function aggiornaAllarmeDaStato(snapshot = null) {
  const stato = snapshot ?? await leggiStorage({ token: null, coda: [], retryAt: 0 });
  const deveSuonare = Boolean(stato.token && Array.isArray(stato.coda) && stato.coda.length > 0);
  const esistente = await chrome.alarms.get(ALLARME_SVUOTA);
  if (!deveSuonare) {
    if (esistente) await chrome.alarms.clear(ALLARME_SVUOTA);
    return;
  }
  const retryAt = Number(stato.retryAt) || 0;
  const when = Math.max(Date.now(), retryAt);
  const esistenteQuando = esistente?.scheduledTime ?? esistente?.when ?? 0;
  const periodico = Number.isFinite(esistente?.periodInMinutes);
  const riutilizzabile = esistente && !periodico && (retryAt === 0 || Math.abs(esistenteQuando - retryAt) < 1000);
  if (riutilizzabile) return;
  if (esistente) await chrome.alarms.clear(ALLARME_SVUOTA);
  await chrome.alarms.create(ALLARME_SVUOTA, { when });
}

async function cardPerEvento(evento, esito) {
  if (!esito?.card) return null;
  const { token } = await leggiStorage({ token: null });
  if (token !== esito.token) return null;
  if (evento.contentKey) return esito.cardUrl === evento.url && esito.cardContentKey === evento.contentKey ? esito.card : null;
  return esito.cardUrl === evento.url ? esito.card : null;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALLARME_SVUOTA) svuota();
});
chrome.permissions.onAdded.addListener(() => adottaSchedeAperte());
conStorage(aggiornaAllarmeDaStato).catch(() => {});

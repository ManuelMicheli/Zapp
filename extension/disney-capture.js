// Cattura Disney+ ISOLATED: stesso protocollo/coda di Netflix e Prime, clock contenuto.
(() => {
  globalThis.__zappDisneyCleanup?.();
  const adapter = globalThis.ZConnectionDisney,
    tracker = adapter.createTracker(),
    listeners = [];
  let disposed = false,
    pageHidden = false,
    last = null,
    lastSent = null,
    lastSentAt = 0,
    suspended = false,
    buffering = false;
  let lastLive = null,
    lastLiveAt = 0;
  function send(type, current) {
    const dati = current
      ? {
          at: current.at,
          url: current.url,
          state: current.state,
          title: null,
          artist: null,
          album: null,
          titleText: current.raw.titleText,
          showText: null,
          pauseText: current.raw.detailText,
          contentKey: current.contentKey,
          playbackRate: current.playbackRate,
          positionMs: current.positionMs,
          durationMs: current.durationMs,
        }
      : null;
    if ("id" in chrome.runtime && !chrome.runtime.id) {
      disposed = true;
      stopTimer();
      return;
    }
    try {
      chrome.runtime.sendMessage({ type, site: "disney", dati }).catch((error) => {
        if (/context invalidated/i.test(String(error?.message))) {
          disposed = true;
          stopTimer();
        }
      });
    } catch {
      /* Aggiornamento estensione. */
    }
  }
  function publishLive(current, force = false) {
    const key = current
      ? JSON.stringify([current.contentKey, current.state, current.playbackRate])
      : "null";
    if (!force && key === lastLive && (key === "null" || Date.now() - lastLiveAt < 30000)) return;
    send("disney-live", current);
    lastLive = key;
    lastLiveAt = Date.now();
  }
  function close(resetTracker = true) {
    if (last) send("evento", { ...last, at: new Date().toISOString(), state: "stopped" });
    last = null;
    lastSent = null;
    suspended = false;
    if (resetTracker) tracker.reset();
  }
  function sample(closing = false, observed, forceLive = false) {
    if (disposed) return false;
    const o = closing
      ? null
      : observed === undefined
        ? adapter.observe(document, location.href)
        : observed;
    // Chiude solo su uscita/cambio contenuto provato. Un annuncio o un seek
    // sospende la sessione allo stesso minuto, senza usare i tempi pubblicitari.
    const sameAsset =
      last &&
      (() => {
        try {
          const current = new URL(location.href),
            old = new URL(last.url);
          return (
            current.origin === old.origin &&
            /^\/it-it\/play\//.test(current.pathname) &&
            current.pathname.replace(/\/$/, "").split("/").pop() ===
              old.pathname.replace(/\/$/, "").split("/").pop()
          );
        } catch {
          return false;
        }
      })();
    if (last && (closing || !sameAsset))
      close();
    if (o && buffering) o.state = "paused";
    const current = tracker.update(o, Date.now());
    if (!current) {
      if (last && !suspended) {
        send("evento", { ...last, at: new Date().toISOString(), state: "paused" });
        suspended = true;
        lastSent = null;
      }
      publishLive(null, forceLive);
      return Boolean(o);
    }
    // La chiave esiste solo dopo la calibrazione: l'osservazione grezza non
    // la contiene e confrontarla chiudeva erroneamente ogni secondo campione.
    if (last && current.contentKey !== last.contentKey) close(false);
    last = current;
    suspended = false;
    publishLive(current, forceLive);
    const key = JSON.stringify([current.contentKey, current.state]);
    if (key !== lastSent || Date.now() - lastSentAt >= 30000) {
      send("evento", current);
      lastSent = key;
      lastSentAt = Date.now();
    }
    return true;
  }
  const on = (target, name, fn) => {
    target.addEventListener(name, fn, true);
    listeners.push(() => target.removeEventListener(name, fn, true));
  };
  for (const name of [
    "playing",
    "pause",
    "seeked",
    "seeking",
    "ratechange",
    "ended",
    "loadedmetadata",
    "waiting",
    "emptied",
  ]) {
    on(document, name, (event) => {
      if (event.target?.tagName !== "VIDEO") return;
      const o = adapter.observe(document, location.href);
      if (o && o.video !== event.target) return;
      if (name === "waiting") buffering = true;
      if (["playing", "seeked", "loadedmetadata", "emptied"].includes(name))
        buffering = false;
      const active = sample(false, o, true);
      schedule(active);
    });
  }
  on(document, "visibilitychange", () => sample());
  on(window, "pagehide", () => {
    pageHidden = true;
    sample(true);
    stopTimer();
  });
  on(window, "pageshow", () => {
    pageHidden = false;
    tracker.reset();
    const active = sample();
    schedule(active);
  });
  const runtime = (msg, _sender, reply) => {
    if (msg?.type === "zapp-ping") {
      reply({ ok: true });
      return false;
    }
    if (msg?.type === "zapp-refresh") {
      const active = sample(false, undefined, true);
      schedule(active);
      reply({ ok: true });
      return false;
    }
    return false;
  };
  chrome.runtime.onMessage.addListener(runtime);
  let timer = null;
  function stopTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }
  function schedule(active = false) {
    if (disposed || pageHidden) return;
    stopTimer();
    const delay = active ? 1000 : document.hidden ? 15000 : 5000;
    timer = setTimeout(() => {
      timer = null;
      const found = sample();
      schedule(found);
    }, delay);
  }
  schedule(sample());
  globalThis.__zappDisneyCleanup = () => {
    disposed = true;
    stopTimer();
    listeners.forEach((fn) => fn());
    chrome.runtime.onMessage.removeListener(runtime);
  };
})();

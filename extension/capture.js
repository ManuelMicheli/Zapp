// MAIN world: solo metadati del player. Nessuna rete, token o interpretazione TMDB.
(() => {
  // Reiniezione/aggiornamento: un solo osservatore e un solo battito per scheda.
  window.__zappCaptureCleanup?.();
  const listeners = [];
  function on(target, event, fn) {
    target.addEventListener(event, fn, true);
    listeners.push(() => target.removeEventListener(event, fn, true));
  }
  const id = () => /^\/watch\/(\d+)/.exec(location.pathname)?.[1] ?? null;
  let watchId = null;
  let memory = {};
  let last = null;
  let timer = null;
  let pending = null;
  let started = 0;
  let sent = null;
  let lastSampleAt = 0;
  let disposed = false;
  let outgoing = null;
  let sampledVideo = null;
  let sampledSource = null;
  const text = (selector) => {
    const el = document.querySelector(selector);
    return (el?.textContent || "").trim() || null;
  };
  function send(state, force = false) {
    if (!state || !(state.titleText || state.showText)) return;
    const fingerprint = JSON.stringify([
      state.url,
      state.state,
      state.positionMs,
      state.titleText,
      state.showText,
      state.pauseText,
      state.durationMs,
    ]);
    if (!force && fingerprint === sent) return;
    sent = fingerprint;
    window.postMessage({ canale: "zapp-capture", dati: state }, location.origin);
  }
  function close() {
    // Se il video e' gia' sparito, conserva l'ultima misura vera (mai stimata).
    if (last) send({ ...last, state: "stopped" }, true);
    last = null;
  }
  function route() {
    const next = id();
    if (next === watchId) return;
    outgoing = next && watchId && last ? {
      ...last, video: sampledVideo, source: sampledSource, ready: false,
    } : null;
    close();
    watchId = next;
    memory = {};
    sent = null;
    started = Date.now();
  }
  function sample() {
    route();
    if (!watchId) return null;
    const titleText = text('[data-uia="video-title"]');
    const showText = text('[data-uia="video-title"] h4');
    const pauseText = text('[data-uia="pause-ad-title-display"]');
    const v = document.querySelector("video");
    // Autoplay aggiorna URL, DOM e video in momenti diversi. Finché vediamo
    // ancora i dati precedenti non attribuirli mai al nuovo /watch/.
    if (outgoing) {
      const newTitle = titleText && titleText !== outgoing.titleText;
      const newMedia = v && (outgoing.ready || v !== outgoing.video ||
        v.currentSrc !== outgoing.source || v.currentTime * 1000 < outgoing.positionMs - 1000 ||
        Number.isFinite(v.duration) && Math.round(v.duration * 1000) !== outgoing.durationMs);
      if (!newTitle || !newMedia) return null;
      outgoing = null;
    }
    // Leggere i nomi anche prima che la durata sia pronta: i comandi scompaiono.
    if (titleText) memory.titleText = titleText;
    if (showText) memory.showText = showText;
    if (pauseText) memory.pauseText = pauseText;
    if (
      !v ||
      v.readyState < 1 ||
      !Number.isFinite(v.currentTime) ||
      !Number.isFinite(v.duration) ||
      v.duration <= 0 ||
      v.seeking
    )
      return null;
    sampledVideo = v;
    sampledSource = v.currentSrc;
    last = {
      at: new Date().toISOString(),
      // Solo l'identita': niente parametri di tracking Netflix nella coda.
      url: location.origin + location.pathname,
      state: v.ended ? "stopped" : v.paused || v.readyState < 3 ? "paused" : "playing",
      title: null,
      artist: null,
      album: null,
      titleText: memory.titleText ?? null,
      showText: memory.showText ?? null,
      pauseText: memory.pauseText ?? null,
      positionMs: Math.floor(v.currentTime * 1000),
      durationMs: Math.round(v.duration * 1000),
    };
    return last;
  }
  function schedule() {
    clearTimeout(timer);
    if (!watchId || disposed || last?.state === "stopped") return;
    const rapid = !sent && Date.now() - started < 60_000;
    timer = setTimeout(
      () => {
        send(sample(), true);
        schedule();
      },
      rapid ? 500 : 30_000,
    );
  }
  function transition() {
    if (disposed) return;
    send(sample());
    // Anche quando play precede loadedmetadata, avvia i tentativi rapidi.
    schedule();
  }
  function soon() {
    if (pending || disposed) return;
    pending = setTimeout(() => {
      pending = null;
      transition();
    }, 100);
  }
  for (const event of [
    "play",
    "playing",
    "durationchange",
    "pause",
    "seeked",
    "ended",
    "waiting",
  ]) {
    on(document, event, transition);
  }
  on(document, "loadedmetadata", () => {
    if (outgoing) outgoing.ready = true;
    transition();
  });
  // Ultima misura in memoria ogni secondo, senza messaggi, storage o rete.
  on(document, "timeupdate", () => {
    if (Date.now() - lastSampleAt < 1000) return;
    lastSampleAt = Date.now();
    sample();
  });
  on(document, "visibilitychange", transition);
  on(window, "pagehide", () => {
    sample();
    close();
    clearTimeout(timer);
  });
  on(window, "pageshow", transition);
  on(window, "popstate", soon);
  // Netflix cambia episodio con history, senza ricaricare il documento.
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    const wrapped = function (...args) {
      if (id() === watchId) sample();
      const result = original.apply(this, args);
      route();
      soon();
      return result;
    };
    history[method] = wrapped;
    listeners.push(() => {
      if (history[method] === wrapped) history[method] = original;
    });
  }
  // Osserva solo l'apparizione/modifica dei tre metadati, non ogni mutazione
  // del player. Callback coalescente; nessun polling a frame o rete aggiuntiva.
  const selector = '[data-uia="video-title"], [data-uia="pause-ad-title-display"]';
  const relevant = (node) => {
    const el = node.nodeType === 1 ? node : node.parentElement;
    return (
      el &&
      (el.matches?.(selector) || el.closest?.(selector) || el.querySelector?.(selector))
    );
  };
  const observer = new MutationObserver((mutations) => {
    if (!id()) return;
    if (
      mutations.some(
        (m) =>
          (relevant(m.target) && m.type === "characterData") ||
          (m.type === "childList" &&
            (m.target.closest?.(selector) || [...m.addedNodes].some(relevant))),
      )
    )
      soon();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  on(window, "message", (e) => {
    if (
      e.source === window &&
      e.origin === location.origin &&
      e.data?.canale === "zapp-richiesta"
    ) {
      sent = null;
      transition();
    }
  });
  window.__zappCaptureCleanup = () => {
    disposed = true;
    clearTimeout(timer);
    clearTimeout(pending);
    observer.disconnect();
    listeners.forEach((remove) => remove());
  };
  transition();
})();

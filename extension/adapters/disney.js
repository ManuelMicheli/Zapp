// Disney Italia: campi e slot osservati nelle sonde 0.2.5/0.2.6.
globalThis.ZConnectionDisney = (() => {
  function deepFind(root, selector) {
    const found = [],
      seen = new Set(),
      queue = [root];
    let index = 0;
    while (index < queue.length && seen.size < 1500) {
      const el = queue[index++];
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.matches?.(selector)) found.push(el);
      if (["SCRIPT", "STYLE", "IFRAME", "FORM", "INPUT", "TEXTAREA"].includes(el.tagName))
        continue;
      queue.push(...Array.from(el.children ?? []));
      if (el.shadowRoot) queue.push(el.shadowRoot);
      if (el.tagName === "SLOT")
        queue.push(...(el.assignedElements?.({ flatten: true }) ?? []));
    }
    return index < queue.length ? [] : found;
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = globalThis.getComputedStyle?.(el);
    return (
      r.width > 0 &&
      r.height > 0 &&
      s?.display !== "none" &&
      s?.visibility !== "hidden" &&
      s?.opacity !== "0"
    );
  };
  function clock(value) {
    const m =
      typeof value === "string" &&
      value.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)$/);
    return !m || (m[1] && Number(m[2]) > 59)
      ? null
      : ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000;
  }
  function observe(document, href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    // La lingua dell'interfaccia apre ogni percorso Disney+ (`/it-it/`, ma
    // `/en-gb/` per lo stesso account con l'inglese impostato): e' contorno,
    // l'identita' del contenuto e' l'uuid. Il catalogo (`/browse/`) resta fuori.
    const asset = url.pathname.match(
      /^\/[a-z]{2}-[a-z]{2}\/play\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/?$/,
    );
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["www.disneyplus.com", "disneyplus.com"].includes(url.hostname) ||
      !asset
    )
      return null;
    const memo = new WeakMap();
    const find = (root, selector) => {
      let selectors = memo.get(root);
      if (!selectors) {
        selectors = new Map();
        memo.set(root, selectors);
      }
      if (!selectors.has(selector)) selectors.set(selector, deepFind(root, selector));
      return selectors.get(selector);
    };
    // Il player reale corrente usa `btm-media-client-element`; nelle versioni
    // precedenti c'era anche `hive-video`. Cerchiamo tutti i video e lasciamo
    // che il filtro di visibilita' elimini anteprime e nodi tecnici nascosti.
    const videos = [...document.querySelectorAll("video")].filter(visible);
    if (videos.length !== 1) return null;
    const video = videos[0],
      root = video.closest(".btm-media-player");
    if (!root || !Number.isFinite(video.currentTime) || video.currentTime < 0)
      return null;
    const ui = find(root, "disney-web-player-ui");
    if (ui.length !== 1) return null;
    // La presenza del solo host pubblicitario non è un annuncio: nelle sonde
    // senza pubblicità esiste ma è vuoto. Un badge visibile con testo sospende.
    if (
      find(ui[0], "ad-badge-overlay").some((host) =>
        find(host, "*").some((el) => visible(el) && el.textContent?.trim()),
      )
    )
      return null;
    const o = {
      site: "disney",
      assetId: asset[1],
      url: url.origin + url.pathname,
      video,
      raw: null,
      positionMs: null,
      durationMs: null,
      rawPositionMs: Math.round(video.currentTime * 1000),
      seeking: video.seeking,
      readyState: video.readyState,
      playbackRate:
        Number.isFinite(video.playbackRate) && video.playbackRate > 0
          ? video.playbackRate
          : 1,
      state: video.ended
        ? "stopped"
        : video.paused || video.readyState < 3
          ? "paused"
          : "playing",
    };
    const single = (host, cls) => {
      const hosts = find(ui[0], host).filter(visible);
      if (hosts.length !== 1) return null;
      const fields = find(hosts[0], cls).filter(visible);
      return fields.length === 1 ? fields[0] : null;
    };
    const title = single("title-bug", ".title-field"),
      detail = single("title-bug", ".subtitle-field");
    const slider = single("progress-bar", ".progress-bar__seekable-range"),
      remaining = single("time-remaining-indicator", ".time-remaining-indicator");
    if (!title || !slider || !remaining) return o;
    const titleText = title.textContent?.trim(),
      detailText = detail?.textContent?.trim() ?? null;
    if (
      !titleText ||
      titleText.length > 500 ||
      titleText === "Video Player" ||
      (detailText !== null && !/^S[1-9]\d?:E[1-9]\d{0,2}\s+\S/.test(detailText))
    )
      return o;
    const pair = slider.getAttribute("aria-valuetext")?.split(" of "),
      numeric = slider.getAttribute("aria-valuemax");
    if (
      slider.getAttribute("role") !== "slider" ||
      pair?.length !== 2 ||
      !/^\d{1,6}$/.test(numeric ?? "")
    )
      return o;
    const durationMs = clock(pair[1]),
      remainingMs = clock(remaining.textContent);
    if (
      !durationMs ||
      remainingMs === null ||
      remainingMs > durationMs ||
      Math.abs(Number(numeric) * 1000 - durationMs) > 1000
    )
      return o;
    return {
      ...o,
      raw: { titleText, detailText },
      durationMs,
      positionMs: durationMs - remainingMs,
    };
  }
  function createTracker() {
    let previous = null,
      confirmed = null;
    const reset = () => {
      previous = null;
      confirmed = null;
    };
    function update(o, at) {
      if (!o || !Number.isFinite(at) || o.seeking || o.readyState < 3) {
        reset();
        return null;
      }
      if (previous && (previous.assetId !== o.assetId || previous.video !== o.video)) {
        reset();
      }
      const before = previous;
      let current = { ...o, at };
      if (!o.raw) {
        if (!confirmed || !before) {
          reset();
          return null;
        }
        current = {
          ...current,
          raw: confirmed.raw,
          durationMs: confirmed.durationMs,
          positionMs: o.rawPositionMs + confirmed.offset,
        };
      }
      const contentKey = JSON.stringify([
        "disney",
        o.assetId,
        current.raw.titleText,
        current.raw.detailText,
      ]);
      const offset = current.positionMs - o.rawPositionMs;
      // Refresh del popup ed eventi DOM possono arrivare fra due tick.
      // Conserva il riferimento temporale, senza perdere una calibrazione valida.
      const ravvicinato = before && before.contentKey === contentKey &&
        before.durationMs === current.durationMs && at >= before.at && at - before.at < 750;
      if (!ravvicinato) previous = { ...current, contentKey, offset };
      if (current.positionMs < 0 || current.positionMs > current.durationMs) {
        reset();
        return null;
      }
      if (
        !before ||
        before.contentKey !== contentKey ||
        before.durationMs !== current.durationMs ||
        at < before.at ||
        at - before.at > 5000
      ) {
        confirmed = null;
        return null;
      }
      if (ravvicinato && !confirmed) return null;
      const rawDelta = o.rawPositionMs - before.rawPositionMs,
        delta = current.positionMs - before.positionMs;
      const elapsed = (at - before.at) * Math.max(o.playbackRate, before.playbackRate);
      if (
        rawDelta < -1200 ||
        rawDelta > elapsed + 1800 ||
        Math.abs(offset - before.offset) > 1800 ||
        Math.abs(delta - rawDelta) > 1800
      ) {
        confirmed = null;
        return null;
      }
      // Il countdown può restare fermo un battito; mai trascinare un salto del seek.
      confirmed = { raw: current.raw, durationMs: current.durationMs, offset };
      return {
        site: "disney",
        url: o.url,
        at: new Date(at).toISOString(),
        contentKey,
        raw: { ...current.raw },
        positionMs: Math.round(current.positionMs),
        durationMs: current.durationMs,
        playbackRate: o.playbackRate,
        state: o.state,
      };
    }
    return { update, reset };
  }
  return { observe, createTracker, clock };
})();

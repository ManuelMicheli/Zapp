// Lettore NOW ricavato dalle fixture 0.2.2: tempo contenuto e annunci separati.
globalThis.ZConnectionNow = (() => {
  function clock(text) {
    const match =
      typeof text === "string" && text.trim().match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
    return match
      ? (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000
      : null;
  }
  function observe(document, href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return null;
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !["nowtv.it", "www.nowtv.it"].includes(url.hostname)
    )
      return null;
    // Solo VOD: la diretta (`/watch/playback/live/`) non e' un film ne' un
    // episodio. Il suffisso di qualita' dell'asset non e' sempre `_HD`.
    const path = url.pathname.match(
      /^\/watch\/playback\/vod\/(?:_|R_\d+(?:_[A-Z]{2,4})?)\/(R_\d+(?:_[A-Z]{2,4})?)\/?$/,
    );
    if (!path) return null;
    const videos = [...document.querySelectorAll(".tapeplayer-container video")].filter(
      (v) => {
        const rect = v.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      },
    );
    if (videos.length !== 1) return null;
    const video = videos[0],
      root = video.closest('[class*="mainContainer-"]');
    if (
      !root ||
      video.readyState < 1 ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      !Number.isFinite(video.currentTime) ||
      video.currentTime < 0
    )
      return null;
    const single = (selector) => {
      const nodes = [...root.querySelectorAll(selector)];
      return nodes.length === 1 ? (nodes[0].textContent || "").trim() : null;
    };
    if ([...root.querySelectorAll('[class*="disclaimer-"]')].some(node => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && node.textContent?.trim() === 'Annuncio pubblicitario';
    })) return null;
    const titleText = single('h1[class*="title-"]');
    const details = [...root.querySelectorAll('[class*="episodeData-"]')];
    if (!titleText || titleText.length > 500 || details.length > 1) return null;
    const detailText = details.length ? (details[0].textContent || "").trim() : null;
    if (detailText !== null && !/^S[1-9]\d? E[1-9]\d{0,2}:\s*\S/.test(detailText))
      return null;
    const positionMs = clock(single('time[aria-label^="Elapsed time:"]'));
    const durationMs = clock(single('time[aria-label^="Total time:"]'));
    if (positionMs === null || !durationMs || positionMs > durationMs) return null;
    return {
      site: "now",
      assetId: path[1],
      url: url.origin + url.pathname,
      video,
      raw: { titleText, detailText },
      positionMs,
      durationMs,
      rawPositionMs: Math.floor(video.currentTime * 1000),
      rawDurationMs: Math.round(video.duration * 1000),
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
      contentKey: JSON.stringify(["now", path[1], titleText, detailText]),
    };
  }
  function createTracker() {
    let previous = null;
    const reset = () => {
      previous = null;
    };
    function update(o, at) {
      if (!o || !Number.isFinite(at) || o.seeking || o.readyState < 3) {
        reset();
        return null;
      }
      const offset = o.rawPositionMs - o.positionMs;
      // La fixture mostra un clock UI ancora a zero subito dopo il ripristino.
      // Non correggere con offset fissi: il tempo aggiunto varia tra i contenuti.
      if (offset < -1500 || offset > Math.max(0, o.rawDurationMs - o.durationMs) + 1500) {
        reset();
        return null;
      }
      const before = previous;
      previous = { ...o, at, offset };
      if (
        !before ||
        before.contentKey !== o.contentKey ||
        before.video !== o.video ||
        before.durationMs !== o.durationMs ||
        Math.abs(before.rawDurationMs - o.rawDurationMs) > 1500 ||
        at - before.at < 750 ||
        at - before.at > 5000
      )
        return null;
      const rawDelta = o.rawPositionMs - before.rawPositionMs;
      const contentDelta = o.positionMs - before.positionMs;
      if (
        Math.abs(offset - before.offset) > 1200 ||
        Math.abs(rawDelta - contentDelta) > 1200 ||
        (o.state === "playing" && before.state === "playing" && contentDelta <= 0)
      )
        return null;
      return {
        site: "now",
        url: o.url,
        at: new Date(at).toISOString(),
        contentKey: o.contentKey,
        raw: { ...o.raw },
        positionMs: o.positionMs,
        durationMs: o.durationMs,
        playbackRate: o.playbackRate,
        state: o.state,
      };
    }
    return { update, reset };
  }
  return { observe, createTracker, clock };
})();

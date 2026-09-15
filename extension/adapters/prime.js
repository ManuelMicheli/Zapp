// Adapter Prime isolato: nessuna rete, storage, listener o modifica al player.
// Usato dalla cattura Prime nel mondo ISOLATED.
globalThis.ZConnectionPrime = (() => {
  function observe(document, href) {
    let url;
    try { url = new URL(href); } catch { return null; }
    // Il prefisso di lingua (`/-/it/`) o di regione (`/region/eu/`) davanti a
    // `/detail/` dipende dall'account, non dal contenuto: si tollera e si
    // normalizza via, cosi' l'identita' spedita resta `/detail/<id>` e combacia
    // con quella che il server riconosce.
    const detail = url.pathname.match(
      /^(?:\/-\/[a-z]{2})?(?:\/region\/[a-z]{2,3})?(\/detail\/[A-Za-z0-9]+)(?:\/|$)/,
    );
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !['primevideo.com', 'www.primevideo.com'].includes(url.hostname) ||
        !detail) return null;
    const titleNode = document.querySelector('.atvwebplayersdk-title-text');
    const videos = [...document.querySelectorAll('.atvwebplayersdk-video-surface video')].filter(video => {
      if (video.closest('.draper-player-container, [data-testid="draper-player"]')) return false;
      const rect = video.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    // Due superfici contemporanee sono una transizione, non si sceglie a caso.
    if (videos.length !== 1) return null;
    const video = videos[0];
    if (video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 0) return null;
    return {
      url: url.origin + detail[1],
      video,
      titlePresent: Boolean(titleNode),
      raw: { titleText: (titleNode?.textContent || '').trim(),
        detailText: (titleNode?.nextElementSibling?.textContent || '').trim() || null },
      positionMs: Number.isFinite(video.currentTime) && video.currentTime >= 0 ? Math.floor(video.currentTime * 1000) : null,
      durationMs: Math.round(video.duration * 1000),
      seeking: video.seeking,
      playbackRate: Number.isFinite(video.playbackRate) && video.playbackRate > 0 ? video.playbackRate : 1,
      state: video.ended ? 'stopped' : video.paused || video.readyState < 3 ? 'paused' : 'playing',
    };
  }
  function createTracker() {
    let last = null, media = null, memory = null, retiredIdentity = null, awaitingMedia = false, suspended = false;
    function reset() { last = null; media = null; memory = null; retiredIdentity = null; awaitingMedia = false; suspended = false; }
    function update(observation, at) {
      let closed = null;
      const close = () => {
        if (last) { closed = { ...last, state: 'stopped' }; retiredIdentity = last.contentKey; }
        last = null; memory = null;
      };
      // Una superficie temporaneamente assente non cancella il riferimento media:
      // serve sia a riprendere la stessa visione sia a riconoscere il cambio.
      if (!observation) { close(); suspended = true; return { current: null, closed }; }
      const o = observation;
      const changedMedia = media && (media.video !== o.video || media.durationMs !== o.durationMs || media.url !== o.url);
      if (changedMedia) { close(); awaitingMedia = false; suspended = false; }
      const newLoad = media && media.epoch !== (o.mediaEpoch ?? 0);
      if (awaitingMedia && !changedMedia && !newLoad) return { current: null, closed };
      if (newLoad) awaitingMedia = false;
      media = { video: o.video, durationMs: o.durationMs, url: o.url, epoch: o.mediaEpoch ?? 0 };
      // I comandi possono aggiungere/togliere il dettaglio senza cambiare video.
      // Conserva un dettaglio gia' noto se sparisce sullo stesso titolo/media.
      const metadata = memory && !changedMedia && memory.raw.titleText === o.raw.titleText &&
        memory.raw.detailText && !o.raw.detailText ? memory.raw : o.raw;
      const rawKey = metadata.titleText ? JSON.stringify(['prime', o.url, metadata.titleText, metadata.detailText]) : null;
      const enriched = memory && memory.raw.titleText === metadata.titleText &&
        !memory.raw.detailText && /^S[1-9]\d?\s+E[1-9]\d{0,2}(?:\s|$)/i.test(metadata.detailText || '');
      if (o.titlePresent && !o.raw.titleText) { close(); suspended = false; return { current: null, closed }; }
      if (rawKey && memory && rawKey !== memory.key && !enriched) {
        // Metadati prima del video: chiude il vecchio, aspetta anche il cambio media.
        close();
        if (!changedMedia && !newLoad) { awaitingMedia = true; return { current: null, closed }; }
      }
      const resumeSameMedia = suspended && !changedMedia && !awaitingMedia;
      if (rawKey && (rawKey !== retiredIdentity || resumeSameMedia)) {
        memory = { key: rawKey, raw: { ...metadata } }; suspended = false;
      }
      if (!memory || o.seeking || o.positionMs === null) return { current: null, closed };
      const current = { site: 'prime', url: o.url, at, contentKey: memory.key,
        raw: { ...memory.raw }, positionMs: o.positionMs, durationMs: o.durationMs, playbackRate: o.playbackRate ?? 1, state: o.state };
      last = current;
      return { current, closed };
    }
    return { update, reset };
  }
  return { observe, createTracker };
})();

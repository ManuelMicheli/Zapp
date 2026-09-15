// Modello puro del popup: il riconoscimento della piattaforma precede la card.
globalThis.ZConnectionPopup = (() => {
  const FRESH_MS = 90000;
  function platform(href) {
    try {
      const u = new URL(href);
      if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
      if (u.hostname === 'www.netflix.com') return {id:'netflix',name:'Netflix'};
      if (['primevideo.com','www.primevideo.com'].includes(u.hostname)) return {id:'prime',name:'Prime Video'};
      if (['disneyplus.com','www.disneyplus.com'].includes(u.hostname)) return {id:'disney',name:'Disney+'};
      if (['nowtv.it','www.nowtv.it'].includes(u.hostname)) return {id:'now',name:'NOW'};
    } catch { /* URL assente o non valida. */ }
    return null;
  }
  function fresh(current, now = Date.now()) {
    const age = now - Date.parse(current?.at);
    return Boolean(platform(current?.url)) && Number.isFinite(age) && age >= -5000 && age < FRESH_MS;
  }
  function position(current, now = Date.now()) {
    const duration = Number.isFinite(current.durationMs) ? Math.max(0,current.durationMs) : 0;
    const base = Number.isFinite(current.positionMs) ? Math.max(0,current.positionMs) : 0;
    const rate = Number.isFinite(current.playbackRate) && current.playbackRate > 0 ? current.playbackRate : 1;
    const age = now - Date.parse(current.at);
    const delta = current.state === 'playing' && fresh(current,now) && !current.seeking ? Math.max(0,age) * rate : 0;
    return Math.min(duration,base + delta);
  }
  function sameContent(current, cardUrl, cardKey) {
    const source = platform(current?.url);
    if (!source || platform(cardUrl)?.id !== source.id) return false;
    if (current.contentKey) return typeof cardKey === 'string' && cardKey === current.contentKey;
    // Compatibilita' Netflix: ogni episodio ha gia' un proprio watch ID.
    if (source.id !== 'netflix') return false;
    const id = href => /^\/watch\/(\d+)(?:\/|$)/.exec(new URL(href).pathname)?.[1];
    return Boolean(id(current.url)) && id(current.url) === id(cardUrl);
  }
  return {platform,fresh,position,sameContent};
})();

// Esegue nel mondo ISOLATED: accede al DOM, mai alle API private del player.
(() => {
  globalThis.__zappPrimeCleanup?.();
  const tracker = globalThis.ZConnectionPrime.createTracker();
  const listeners = [];
  let lastSent = null, lastSentAt = 0, disposed = false, pageHidden = false;
  let lastLive = null, lastLiveAt = 0;
  let buffering = false;
  const epochs = new WeakMap();
  function send(type, dati) {
    if ('id' in chrome.runtime && !chrome.runtime.id) { disposed=true;stopTimer();return; }
    try { chrome.runtime.sendMessage({ type, site: 'prime', dati }).catch((error) => {
      if (/context invalidated/i.test(String(error?.message))) {disposed=true;stopTimer();}
    }); }
    catch { /* Estensione aggiornata: non interrompere la pagina. */ }
  }
  function publishLive(current, force = false) {
    const key = current ? JSON.stringify([current.contentKey,current.state,current.playbackRate]) : 'null';
    if (!force && key === lastLive && (key === 'null' || Date.now()-lastLiveAt < 30000)) return;
    send('prime-live',payload(current));lastLive=key;lastLiveAt=Date.now();
  }
  function payload(current) {
    if (!current) return null;
    return {at:current.at,url:current.url,state:current.state,
      title:null,artist:null,album:null,titleText:current.raw.titleText,
      showText:null,pauseText:current.raw.detailText,
      contentKey:current.contentKey,playbackRate:current.playbackRate,
      positionMs:current.positionMs,durationMs:current.durationMs};
  }
  function sample(force = false, refreshOnly = false, closing = false, observed) {
    if (disposed) return false;
    let observation = closing ? null : observed === undefined ? globalThis.ZConnectionPrime.observe(document, location.href) : observed;
    if (observation) {
      observation.mediaEpoch = epochs.get(observation.video) ?? 0;
      if (buffering) observation.state = 'paused';
    }
    const {current, closed} = tracker.update(observation, new Date().toISOString());
    if (closed) { send('evento',payload(closed)); lastSent=null; }
    publishLive(current,force || refreshOnly || Boolean(closed));
    if (!current || refreshOnly) return Boolean(observation);
    const key = JSON.stringify([current.contentKey,current.state]);
    if (force || key !== lastSent || Date.now()-lastSentAt >= 30000) {
      send('evento',payload(current)); lastSent=key;lastSentAt=Date.now();
    }
    return true;
  }
  function on(name, fn, target = document) {
    target.addEventListener(name,fn,true);
    listeners.push(()=>target.removeEventListener(name,fn,true));
  }
  for (const name of ['playing','pause','seeked','ratechange','ended','loadedmetadata','waiting','emptied']) {
    on(name,event=>{
      // Non reagire alle anteprime quando il video selezionato e' un altro.
      const o=globalThis.ZConnectionPrime.observe(document,location.href);
      if (o && event.target !== o.video) return;
      if(name==='loadedmetadata') epochs.set(event.target,(epochs.get(event.target) ?? 0)+1);
      if(name==='waiting') buffering=true;
      if(['playing','seeked','loadedmetadata','emptied'].includes(name)) buffering=false;
      const active=sample(true,false,false,o);
      schedule(active);
    });
  }
  on('visibilitychange',()=>sample(true));
  on('pagehide',()=>{pageHidden=true;sample(false,false,true);stopTimer();},window);
  on('pageshow',()=>{pageHidden=false;tracker.reset();const active=sample(true);schedule(active);},window);
  const runtime = (msg,_sender,reply) => {
    if(msg?.type==='zapp-ping'){reply({ok:true});return false;}
    if(msg?.type==='zapp-refresh'){const active=sample(true,true);schedule(active);reply({ok:true});return false;}
    return false;
  };
  chrome.runtime.onMessage.addListener(runtime);
  // Acquisizione/calibrazione a un secondo; fuori dal player basta un tentativo
  // raro. Nel browser usa timeout ricorsivi, cosi' una scansione lenta non si accoda.
  let timer=null;
  function stopTimer(){
    if(timer===null)return;
    clearTimeout(timer);
    timer=null;
  }
  function schedule(active=false){
    if(disposed || pageHidden)return;
    stopTimer();
    const delay=active?1000:(document.hidden?15000:5000);
    timer=setTimeout(()=>{timer=null;const found=sample();schedule(found);},delay);
  }
  schedule(sample());
  globalThis.__zappPrimeCleanup=()=>{
    disposed=true;stopTimer();listeners.forEach(remove=>remove());
    chrome.runtime.onMessage.removeListener(runtime);
  };
})();

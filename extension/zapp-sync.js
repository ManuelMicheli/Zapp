// ISOLATED world: inoltra alla pagina solo un evento locale, senza dati utente.
(() => {
  window.__zappSyncCleanup?.();
  const listener = (msg) => {
    if (msg?.type !== "zapp-watch-updated") return;
    window.dispatchEvent(new CustomEvent("zapp:watch-updated"));
  };
  chrome.runtime.onMessage.addListener(listener);
  window.__zappSyncCleanup = () => {
    chrome.runtime.onMessage.removeListener(listener);
    delete window.__zappSyncCleanup;
  };
})();

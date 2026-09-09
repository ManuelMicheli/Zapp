function mostra() {
  chrome.storage.local.get({ righe: [] }, ({ righe }) => {
    document.getElementById("conta").textContent = String(righe.length);
    document.getElementById("out").textContent = JSON.stringify(righe, null, 2);
  });
}
document.getElementById("copia").addEventListener("click", () => {
  chrome.storage.local.get({ righe: [] }, ({ righe }) => {
    navigator.clipboard.writeText(JSON.stringify(righe, null, 2));
  });
});
document.getElementById("pulisci").addEventListener("click", () => {
  chrome.storage.local.set({ righe: [] }, mostra);
});
mostra();

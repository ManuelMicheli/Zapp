import fs from "node:fs";
import { nav } from "./gen-search.mjs";

const head = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
  <style>
    body { margin: 0; font-family: "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: #a78bfa; text-decoration: none; } a:hover { color: #c4b5fd; }
    .z-name { font-size: 13px; font-weight: 500; color: #ffffff; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .z-meta { font-size: 11px; color: #8e8e93; }
    .z-tab { height: 38px; padding: 0 16px; border-radius: 19px; font-size: 13px; font-weight: 600; display: flex; align-items: center; white-space: nowrap; flex-shrink: 0; }
  </style>
</helmet>
<div style="width: 390px; height: 844px; background: #000000; color: #ffffff; position: relative; overflow: hidden; box-sizing: border-box;">
`;
const tail = `</div>
</x-dc>
</body>
</html>
`;

const dots = `<div style="position: absolute; right: 6px; top: 6px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg></div>`;

function card(img, name, year, rating) {
  return `      <div style="display: flex; flex-direction: column; gap: 8px; width: 106px;">
        <div style="position: relative; width: 106px; height: 159px;"><img src="${img}" alt="" style="width: 106px; height: 159px; border-radius: 14px; object-fit: cover; display: block; background: #1c1c1e;">${dots}</div>
        <div style="display: flex; flex-direction: column; gap: 2px;"><div class="z-name">${name}</div><div style="display: flex; gap: 6px; align-items: baseline;">${rating != null ? `<span style="font-size: 11px; font-weight: 600; color: #a78bfa;">★ ${rating}</span>` : ""}<span class="z-meta">${year}</span></div></div>
      </div>`;
}

const items = [
  card("p15.jpg", "Silo", "2023", 9),
  card("p10.jpg", "Spider-Man: Brand New Day", "2026", 9),
  card("p03.jpg", "Coyote vs. Acme", "2026", 8),
  card("p18.jpg", "The Gentlemen", "2024", 8),
  card("p12.jpg", "The Last Sunrise", "2026", 7),
  card("p07.jpg", "Dark Matter", "2024", 8),
  card("p14.jpg", "Mousetrap", "2026", null),
  card("p16.jpg", "La donna senza passato", "2026", 6),
  card("p05.jpg", "Obsession", "2026", 7),
];

const tabs = ["Sto guardando", "Da vedere", "Visti", "Abbandonati"];
const active = "Visti";

const body = `
  <div style="position: absolute; left: -140px; top: -180px; width: 460px; height: 380px; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%); filter: blur(44px);"></div>

  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; flex-direction: column; gap: 16px; padding: 64px 0 0; box-sizing: border-box;">
    <div style="display: flex; align-items: baseline; justify-content: space-between; padding: 0 20px;">
      <div style="font-size: 34px; font-weight: 700; letter-spacing: -0.045em; line-height: 1; color: #ffffff;">Libreria</div>
      <div style="display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08);">
        <div style="height: 28px; padding: 0 12px; border-radius: 14px; background: rgba(255,255,255,0.14); color: #ffffff; font-size: 12px; font-weight: 600; display: flex; align-items: center;">Tutti</div>
        <div style="height: 28px; padding: 0 12px; border-radius: 14px; color: #8e8e93; font-size: 12px; font-weight: 600; display: flex; align-items: center;">Film</div>
        <div style="height: 28px; padding: 0 12px; border-radius: 14px; color: #8e8e93; font-size: 12px; font-weight: 600; display: flex; align-items: center;">Serie</div>
      </div>
    </div>
    <div style="display: flex; gap: 8px; padding: 0 20px; overflow: hidden;">
      ${tabs.map((t) => t === active
        ? `<div class="z-tab" style="background: #8b5cf6; color: #ffffff; box-shadow: 0 6px 20px rgba(139,92,246,0.35);">${t}</div>`
        : `<div class="z-tab" style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); color: #8e8e93;">${t}</div>`).join("\n      ")}
    </div>
  </div>

  <div style="position: absolute; left: 20px; top: 190px; width: 350px; display: flex; flex-direction: column; gap: 14px;">
    <div style="font-size: 13px; color: #8e8e93;">42 titoli</div>
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 16px;">
${items.join("\n")}
    </div>
  </div>
`;

fs.writeFileSync("Library.dc.html", head + body + nav("Libreria") + tail);

const sheetRow = (label, icon, danger) => `      <div style="display: flex; align-items: center; gap: 14px; height: 54px; padding: 0 16px; border-radius: 14px; ${danger ? "color: #f87171;" : "color: #ffffff;"} font-size: 16px; font-weight: 500;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${danger ? "#f87171" : "#c4b5fd"}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>
        <span>${label}</span>
      </div>`;

const sheet = `
  <div style="position: absolute; left: 0; top: 0; width: 390px; height: 844px; background: rgba(0,0,0,0.62); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);"></div>
  <div style="position: absolute; left: 0; bottom: 0; width: 390px; background: #0a0a0c; border-top: 1px solid rgba(255,255,255,0.08); border-radius: 32px 32px 0 0; padding: 14px 16px 36px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 -20px 60px rgba(0,0,0,0.7);">
    <div style="width: 36px; height: 5px; border-radius: 3px; background: rgba(255,255,255,0.18); align-self: center;"></div>
    <div style="display: flex; align-items: center; gap: 14px; padding: 0 4px;">
      <img src="p18.jpg" alt="" style="width: 48px; height: 72px; border-radius: 10px; object-fit: cover; display: block;">
      <div style="display: flex; flex-direction: column; gap: 3px;">
        <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: #ffffff;">The Gentlemen</div>
        <div style="font-size: 13px; color: #8e8e93;">Serie, 2024. In Visti con ★ 8</div>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px; padding: 4px; border-radius: 20px; background: #101014; border: 1px solid rgba(255,255,255,0.07);">
${[
  sheetRow("Voglio vederlo", `<path d="M12 5v14M5 12h14"></path>`, false),
  sheetRow("Sto guardando", `<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"></path>`, false),
  sheetRow("Abbandona", `<path d="M6 6l12 12M18 6 6 18"></path>`, false),
].join("\n")}
    </div>
    <div style="display: flex; flex-direction: column; gap: 2px; padding: 4px; border-radius: 20px; background: #101014; border: 1px solid rgba(255,255,255,0.07);">
${sheetRow("Rimuovi dalla libreria", `<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3"></path>`, true)}
    </div>
  </div>
`;

fs.writeFileSync("LibrarySheet.dc.html", head + body + nav("Libreria") + sheet + tail);
console.log("ok library");

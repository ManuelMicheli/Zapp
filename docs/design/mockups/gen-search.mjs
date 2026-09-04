import fs from "node:fs";

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
    .z-poster { width: 112px; height: 168px; border-radius: 14px; object-fit: cover; display: block; background: #1c1c1e; }
    .z-logo { width: 20px; height: 20px; border-radius: 6px; object-fit: cover; display: block; border: 1px solid rgba(0,0,0,0.5); }
    .z-row { display: flex; gap: 12px; padding: 0 20px; overflow: hidden; }
    .z-h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff; }
    .z-name { font-size: 13px; font-weight: 500; color: #ffffff; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .z-meta { font-size: 11px; color: #8e8e93; }
    .z-chip { height: 36px; padding: 0 14px; border-radius: 18px; background: #141418; border: 1px solid rgba(255,255,255,0.08); color: #ffffff; font-size: 13px; font-weight: 500; display: flex; align-items: center; white-space: nowrap; }
  </style>
</helmet>
<div style="width: 390px; height: 844px; background: #000000; color: #ffffff; position: relative; overflow: hidden; box-sizing: border-box;">
`;

const tail = `</div>
</x-dc>
</body>
</html>
`;

const searchIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.35-4.35"></path></svg>`;

function tab(icon, label, active) {
  return `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 62px; height: 52px; border-radius: 26px; ${active ? "background: rgba(139,92,246,0.22);" : ""}"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${active ? "#c4b5fd" : "#8e8e93"}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg><span style="font-size: 10px; font-weight: 500; color: ${active ? "#c4b5fd" : "#8e8e93"};">${label}</span></div>`;
}

export function nav(activeLabel) {
  const tabs = [
    ["Home", `<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z"></path>`],
    ["Cerca", `<circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.35-4.35"></path>`],
    ["Libreria", `<path d="M4 5a1 1 0 0 1 1-1h3v16H5a1 1 0 0 1-1-1V5Z"></path><path d="M10 4h4v16h-4z"></path><path d="m16.5 4.6 3.9 1a1 1 0 0 1 .7 1.2L17.8 20l-3.9-1 3.6-14.4Z"></path>`],
    ["Amici", `<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"></path><circle cx="17.5" cy="9" r="2.5"></circle><path d="M16 14.2c3 .3 5.5 2.4 5.5 5.3"></path>`],
    ["Profilo", `<circle cx="12" cy="8" r="4"></circle><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"></path>`],
  ];
  return `  <div style="position: absolute; left: 0; bottom: 0; width: 390px; height: 140px; background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 60%, #000000 100%); pointer-events: none;"></div>
  <div style="position: absolute; left: 16px; bottom: 22px; width: 358px; height: 64px; border-radius: 32px; background: rgba(28,28,30,0.72); border: 1px solid rgba(255,255,255,0.10); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); box-shadow: 0 20px 50px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; padding: 0 6px; box-sizing: border-box;">
    ${tabs.map(([l, i]) => tab(i, l, l === activeLabel)).join("\n    ")}
  </div>
`;
}

function shelfCard(img, name, meta, logo) {
  return `        <div style="display: flex; flex-direction: column; gap: 8px; width: 112px; flex-shrink: 0;">
          <div style="position: relative; width: 112px; height: 168px;"><img class="z-poster" src="${img}" alt="">${logo ? `<img class="z-logo" src="${logo}" alt="" style="position: absolute; left: 6px; bottom: 6px;">` : ""}</div>
          <div style="display: flex; flex-direction: column; gap: 2px;"><div class="z-name">${name}</div><div class="z-meta">${meta}</div></div>
        </div>`;
}

function shelf(title, cards) {
  return `    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; align-items: baseline; justify-content: space-between; padding: 0 20px;">
        <div class="z-h2">${title}</div>
      </div>
      <div class="z-row">
${cards.join("\n")}
      </div>
    </div>`;
}

const genres = ["Azione", "Avventura", "Animazione", "Commedia", "Crime", "Dramma", "Fantasy", "Horror", "Mistero", "Fantascienza", "Thriller", "Romance"];

// --- Stato iniziale: Discover ---
const search = head + `
  <div style="position: absolute; left: -140px; top: -180px; width: 460px; height: 380px; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%); filter: blur(44px);"></div>

  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; flex-direction: column; gap: 16px; padding: 64px 20px 0; box-sizing: border-box;">
    <div style="font-size: 34px; font-weight: 700; letter-spacing: -0.045em; line-height: 1; color: #ffffff;">Cerca</div>
    <div style="height: 52px; border-radius: 26px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.10); display: flex; align-items: center; gap: 10px; padding: 0 18px; box-sizing: border-box;">
      ${searchIcon}
      <span style="font-size: 16px; color: #8e8e93;">Film, serie TV…</span>
    </div>
  </div>

  <div style="position: absolute; left: 0; top: 176px; width: 390px; display: flex; flex-direction: column; gap: 32px;">
${shelf("Di tendenza questa settimana", [
  shelfCard("p01.jpg", "L'uomo dei sussurri", "2026"),
  shelfCard("p02.jpg", "Odissea", "2026"),
  shelfCard("p03.jpg", "Coyote vs. Acme", "2026"),
  shelfCard("p04.jpg", "Lanterns", "2026"),
])}
${shelf("Nuovi su streaming", [
  shelfCard("p05.jpg", "Obsession", "2026", "prov8.jpg"),
  shelfCard("p17.jpg", "Reacher", "2026", "prov119.jpg"),
  shelfCard("p11.jpg", "Bleach", "2026", "prov337.jpg"),
  shelfCard("p15.jpg", "Silo", "2026", "prov350.jpg"),
])}
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="z-h2" style="padding: 0 20px;">Per genere</div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px;">
        ${genres.map((g) => `<div class="z-chip">${g}</div>`).join("\n        ")}
      </div>
    </div>
  </div>

` + nav("Cerca") + tail;

fs.writeFileSync("Search.dc.html", search);

// --- Risultati ---
function gridCard(img, name, year, logos) {
  return `      <div style="display: flex; flex-direction: column; gap: 8px; width: 106px;">
        <div style="position: relative; width: 106px; height: 159px;"><img src="${img}" alt="" style="width: 106px; height: 159px; border-radius: 14px; object-fit: cover; display: block; background: #1c1c1e;">${logos.length ? `<div style="position: absolute; left: 6px; bottom: 6px; display: flex; gap: 4px;">${logos.map((l) => `<img class="z-logo" src="${l}" alt="">`).join("")}</div>` : ""}</div>
        <div style="display: flex; flex-direction: column; gap: 2px;"><div class="z-name">${name}</div><div class="z-meta">${year}</div></div>
      </div>`;
}

const results = head + `
  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; align-items: center; gap: 12px; padding: 64px 20px 0; box-sizing: border-box;">
    <div style="flex-grow: 1; height: 52px; border-radius: 26px; background: rgba(255,255,255,0.08); border: 1px solid #8b5cf6; box-shadow: 0 0 0 4px rgba(139,92,246,0.16); display: flex; align-items: center; gap: 10px; padding: 0 18px; box-sizing: border-box;">
      ${searchIcon}
      <span style="font-size: 16px; color: #ffffff; display: flex; align-items: center; gap: 2px;"><span>the</span><span style="display: inline-block; width: 2px; height: 20px; background: #8b5cf6;"></span></span>
      <div style="margin-left: auto; width: 22px; height: 22px; border-radius: 50%; background: rgba(255,255,255,0.18); display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg></div>
    </div>
    <a href="#" style="font-size: 16px; font-weight: 500; color: #ffffff;">Annulla</a>
  </div>

  <div style="position: absolute; left: 20px; top: 136px; width: 350px; display: flex; flex-direction: column; gap: 14px;">
    <div style="font-size: 13px; color: #8e8e93;">8 risultati</div>
    <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 16px;">
${[
  gridCard("p08.jpg", "The Runner", "2026", ["prov119.jpg"]),
  gridCard("p09.jpg", "The Dog Stars", "2026", ["prov8.jpg"]),
  gridCard("p18.jpg", "The Gentlemen", "2024", ["prov8.jpg"]),
  gridCard("p12.jpg", "The Last Sunrise", "2026", []),
  gridCard("p13.jpg", "The Shards", "2026", ["prov350.jpg"]),
  gridCard("p07.jpg", "Dark Matter", "2024", ["prov350.jpg"]),
  gridCard("p04.jpg", "Lanterns", "2026", ["prov8.jpg", "prov337.jpg"]),
  gridCard("p16.jpg", "La donna senza passato", "2026", ["prov337.jpg"]),
].join("\n")}
    </div>
  </div>

` + nav("Cerca") + tail;

fs.writeFileSync("SearchResults.dc.html", results);
console.log("ok");

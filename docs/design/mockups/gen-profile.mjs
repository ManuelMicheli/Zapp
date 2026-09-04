import fs from "node:fs";
import { nav } from "./gen-search.mjs";

const head = (h) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
  <style>
    body { margin: 0; font-family: "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: #a78bfa; text-decoration: none; } a:hover { color: #c4b5fd; }
    @keyframes zapp-up { from { transform: translateY(0); } to { transform: translateY(-33.333%); } }
    @keyframes zapp-down { from { transform: translateY(-33.333%); } to { transform: translateY(0); } }
    .zapp-col { display: flex; flex-direction: column; gap: 10px; padding-bottom: 10px; will-change: transform; }
    .zapp-col-a { animation: zapp-up 90s linear infinite; }
    .zapp-col-b { animation: zapp-down 104s linear infinite; }
    .zapp-col-c { animation: zapp-up 96s linear infinite; }
    .zapp-col-d { animation: zapp-down 110s linear infinite; }
    .zapp-poster { width: 96px; height: 144px; border-radius: 10px; object-fit: cover; display: block; background: #1c1c1e; }
    @media (prefers-reduced-motion: reduce) { .zapp-col { animation: none; } }
    .z-h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff; }
    .z-row-item { height: 56px; display: flex; align-items: center; justify-content: space-between; padding: 0 4px; }
    .z-glass { background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.14); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
  </style>
</helmet>
<div style="width: 390px; height: ${h}px; background: #000000; color: #ffffff; position: relative; overflow: hidden; box-sizing: border-box;">
`;
const tail = `</div>
</x-dc>
</body>
</html>
`;

const col = (cls, mt, imgs) => `      <div class="zapp-col ${cls}" style="margin-top: ${mt}px;">
${[...imgs, ...imgs, ...imgs].map((i) => `        <img class="zapp-poster" src="${i}" alt="">`).join("\n")}
      </div>`;

const wall = `
  <div style="position: absolute; left: -60px; top: -110px; width: 520px; height: 470px; perspective: 1000px; overflow: hidden; opacity: 0.75;">
    <div style="display: flex; gap: 10px; transform: rotateX(24deg) rotateZ(-8deg) translateY(-30px); transform-origin: 50% 0%;">
${col("zapp-col-a", 0, ["p15.jpg", "p03.jpg", "p12.jpg", "p14.jpg"])}
${col("zapp-col-b", -260, ["p10.jpg", "p18.jpg", "p07.jpg", "p16.jpg"])}
${col("zapp-col-c", -50, ["p05.jpg", "p01.jpg", "p02.jpg", "p11.jpg"])}
${col("zapp-col-d", -300, ["p13.jpg", "p08.jpg", "p09.jpg", "p04.jpg"])}
    </div>
  </div>
  <div style="position: absolute; left: 0; top: 0; width: 390px; height: 400px; background: linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 25%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.96) 85%, #000000 100%);"></div>
  <div style="position: absolute; left: 75px; top: 60px; width: 240px; height: 240px; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,0.55) 0%, rgba(139,92,246,0.15) 45%, rgba(0,0,0,0) 70%); filter: blur(36px);"></div>
`;

const topRow = `
  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; align-items: center; justify-content: space-between; padding: 58px 20px 0; box-sizing: border-box;">
    <div class="z-glass" style="height: 36px; padding: 0 14px; border-radius: 18px; color: #ffffff; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>
      <span>Modifica</span>
    </div>
    <div class="z-glass" style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>
    </div>
  </div>
`;

const identity = `
  <div style="position: absolute; left: 0; top: 122px; width: 390px; display: flex; flex-direction: column; align-items: center; gap: 14px;">
    <div style="position: relative; width: 124px; height: 124px;">
      <div style="position: absolute; left: -6px; top: -6px; width: 136px; height: 136px; border-radius: 50%; background: conic-gradient(from 200deg, #c4b5fd, #7c3aed, #2e1065, #8b5cf6, #c4b5fd); opacity: 0.9;"></div>
      <div style="position: absolute; left: -2px; top: -2px; width: 128px; height: 128px; border-radius: 50%; background: #000000;"></div>
      <div style="position: absolute; left: 0; top: 0; width: 124px; height: 124px; border-radius: 50%; background: linear-gradient(135deg, #a78bfa 0%, #6d28d9 100%); display: flex; align-items: center; justify-content: center; font-size: 52px; font-weight: 800; letter-spacing: -0.05em; color: #ffffff; box-shadow: 0 24px 60px rgba(139,92,246,0.45);">M</div>
      <div style="position: absolute; right: 0px; bottom: 2px; width: 34px; height: 34px; border-radius: 50%; background: #ffffff; border: 3px solid #000000; display: flex; align-items: center; justify-content: center;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.2-2h5.6L16 6h1.5A2.5 2.5 0 0 1 20 8.5V17a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17z"></path><circle cx="12" cy="12.5" r="3.2"></circle></svg>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
      <div style="font-size: 34px; font-weight: 800; letter-spacing: -0.05em; line-height: 1; color: #ffffff;">Manuel</div>
      <div style="font-size: 15px; color: rgba(255,255,255,0.55);">@cinefilo_92</div>
    </div>
    <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.7);">
      <div style="display: flex; align-items: center;">
        <div style="width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #f0abfc, #7c3aed); border: 2px solid #000000;"></div>
        <div style="width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #67e8f9, #4c1d95); border: 2px solid #000000; margin-left: -8px;"></div>
        <div style="width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #fde68a, #a855f7); border: 2px solid #000000; margin-left: -8px;"></div>
      </div>
      <span>5 amici</span>
    </div>
  </div>
`;

const statBig = `
  <div style="position: absolute; left: 20px; top: 400px; width: 350px; display: flex; align-items: stretch; gap: 20px;">
    <div style="display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;">
      <div style="font-size: 76px; font-weight: 800; letter-spacing: -0.06em; line-height: 0.9; color: #ffffff;">196</div>
      <div style="font-size: 14px; color: rgba(255,255,255,0.6);">ore di film e serie</div>
    </div>
    <div style="width: 1px; background: rgba(255,255,255,0.10); align-self: stretch;"></div>
    <div style="display: flex; flex-direction: column; justify-content: space-between; flex-grow: 1; padding: 2px 0;">
      <div style="display: flex; align-items: baseline; justify-content: space-between;"><span style="font-size: 13px; color: rgba(255,255,255,0.6);">Film visti</span><span style="font-size: 20px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff;">38</span></div>
      <div style="display: flex; align-items: baseline; justify-content: space-between;"><span style="font-size: 13px; color: rgba(255,255,255,0.6);">Serie viste</span><span style="font-size: 20px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff;">12</span></div>
      <div style="display: flex; align-items: baseline; justify-content: space-between;"><span style="font-size: 13px; color: rgba(255,255,255,0.6);">Episodi</span><span style="font-size: 20px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff;">214</span></div>
    </div>
  </div>
`;

const genres = [["Dramma", 33, "#3b82f6"], ["Fantascienza", 24, "#22d3ee"], ["Thriller", 19, "#ef4444"], ["Commedia", 14, "#facc15"], ["Crime", 10, "#f97316"]];
const dna = `
  <div style="position: absolute; left: 20px; top: 526px; width: 350px; display: flex; flex-direction: column; gap: 14px;">
    <div style="display: flex; align-items: baseline; justify-content: space-between;">
      <div class="z-h2">Generi più visti</div>
      <div style="font-size: 12px; color: #8e8e93;">su 50 titoli</div>
    </div>
    <div style="display: flex; gap: 3px; height: 14px; border-radius: 7px; overflow: hidden;">
      ${genres.map(([, p, c]) => `<div style="flex-grow: ${p}; flex-basis: 0; background: ${c};"></div>`).join("\n      ")}
    </div>
    <div style="display: flex; flex-wrap: wrap; gap: 8px 16px;">
      ${genres.map(([g, p, c]) => `<div style="display: flex; align-items: center; gap: 6px; font-size: 13px; color: #ffffff;"><div style="width: 8px; height: 8px; border-radius: 50%; background: ${c};"></div><span>${g}</span><span style="color: #8e8e93;">${p}%</span></div>`).join("\n      ")}
    </div>
  </div>
`;

const topCard = (img, name, r) => `      <div style="position: relative; width: 150px; height: 225px; flex-shrink: 0; border-radius: 18px; overflow: hidden; box-shadow: 0 16px 40px rgba(0,0,0,0.6);">
        <img src="${img}" alt="" style="width: 150px; height: 225px; object-fit: cover; display: block; background: #1c1c1e;">
        <div style="position: absolute; left: 0; bottom: 0; width: 150px; height: 110px; background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 100%);"></div>
        <div style="position: absolute; left: 12px; bottom: 12px; right: 12px; display: flex; align-items: flex-end; justify-content: space-between; gap: 8px;">
          <div style="font-size: 13px; font-weight: 600; color: #ffffff; line-height: 1.2; text-wrap: balance;">${name}</div>
          <div style="font-size: 30px; font-weight: 800; letter-spacing: -0.05em; line-height: 1; color: #c4b5fd; flex-shrink: 0;">${r}</div>
        </div>
      </div>`;

const top = `
  <div style="position: absolute; left: 0; top: 672px; width: 390px; display: flex; flex-direction: column; gap: 14px;">
    <div style="display: flex; align-items: baseline; justify-content: space-between; padding: 0 20px;">
      <div class="z-h2">I tuoi voti più alti</div>
      <a href="#" style="font-size: 13px; font-weight: 500;">Vedi tutti</a>
    </div>
    <div style="display: flex; gap: 12px; padding: 0 20px; overflow: hidden;">
${[topCard("p15.jpg", "Silo", 9), topCard("p10.jpg", "Spider-Man: Brand New Day", 9), topCard("p03.jpg", "Coyote vs. Acme", 8)].join("\n")}
    </div>
  </div>
`;

const settings = `
  <div style="position: absolute; left: 20px; top: 966px; width: 350px; display: flex; flex-direction: column; gap: 22px;">
    <div style="display: flex; flex-direction: column; border-radius: 22px; background: #0e0e12; border: 1px solid rgba(255,255,255,0.07); padding: 4px 14px;">
      <div class="z-row-item">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff;">Profilo privato</div>
          <div style="font-size: 12px; color: #8e8e93;">Solo gli amici vedranno le tue liste.</div>
        </div>
        <div style="width: 50px; height: 30px; border-radius: 15px; background: rgba(255,255,255,0.14); position: relative; flex-shrink: 0;"><div style="position: absolute; left: 2px; top: 2px; width: 26px; height: 26px; border-radius: 50%; background: #ffffff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div></div>
      </div>
      <div style="height: 1px; background: rgba(255,255,255,0.07);"></div>
      <div class="z-row-item">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 30px; height: 30px; border-radius: 8px; background: #E50914; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 800; color: #ffffff;">N</div>
          <span style="font-size: 15px; font-weight: 500; color: #ffffff;">Importa da Netflix</span>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>
      </div>
      <div style="height: 1px; background: rgba(255,255,255,0.07);"></div>
      <div class="z-row-item" style="justify-content: center; color: #f87171; font-size: 15px; font-weight: 500;">Esci</div>
    </div>
    <div style="padding: 0 12px; text-align: center; font-size: 11px; line-height: 1.5; color: #6e6e73;">This product uses the TMDB API but is not endorsed or certified by TMDB.</div>
  </div>
`;

const content = wall + topRow + identity + statBig + dna + top + settings;
fs.writeFileSync("Profile.dc.html", head(844) + content + nav("Profilo") + tail);
fs.writeFileSync("ProfileFull.dc.html", head(1220) + content + tail);
console.log("ok profile");

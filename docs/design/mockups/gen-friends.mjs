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
    .z-h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff; }
    .z-card { border-radius: 20px; background: #101014; border: 1px solid rgba(255,255,255,0.07); }
    .z-av { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #ffffff; flex-shrink: 0; }
    .z-thumb { width: 40px; height: 60px; border-radius: 8px; object-fit: cover; display: block; background: #1c1c1e; flex-shrink: 0; }
    .z-feed { font-size: 14px; line-height: 1.4; color: rgba(255,255,255,0.78); }
    .z-feed b { font-weight: 600; color: #ffffff; }
  </style>
</helmet>
<div style="width: 390px; height: 844px; background: #000000; color: #ffffff; position: relative; overflow: hidden; box-sizing: border-box;">
`;
const tail = `</div>
</x-dc>
</body>
</html>
`;

const grads = {
  E: "linear-gradient(135deg, #f0abfc, #7c3aed)",
  M: "linear-gradient(135deg, #67e8f9, #4c1d95)",
  G: "linear-gradient(135deg, #fde68a, #a855f7)",
  L: "linear-gradient(135deg, #a78bfa, #1e1b4b)",
  S: "linear-gradient(135deg, #fda4af, #6d28d9)",
  D: "linear-gradient(135deg, #86efac, #5b21b6)",
};
const av = (l, size, fs) => `<div class="z-av" style="width: ${size}px; height: ${size}px; font-size: ${fs}px; background: ${grads[l]};">${l}</div>`;

const topbar = `
  <div style="position: absolute; left: -140px; top: -180px; width: 460px; height: 380px; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%); filter: blur(44px);"></div>
  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; flex-direction: column; gap: 16px; padding: 64px 20px 0; box-sizing: border-box;">
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div style="font-size: 34px; font-weight: 700; letter-spacing: -0.045em; line-height: 1; color: #ffffff;">Amici</div>
      <div style="position: relative; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.10); display: flex; align-items: center; justify-content: center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"></path><path d="M10 20a2 2 0 0 0 4 0"></path></svg>
        <div style="position: absolute; right: 7px; top: 7px; width: 9px; height: 9px; border-radius: 50%; background: #8b5cf6; border: 2px solid #000000;"></div>
      </div>
    </div>
    <div style="height: 48px; border-radius: 24px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.10); display: flex; align-items: center; gap: 10px; padding: 0 16px; box-sizing: border-box;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.35-4.35"></path></svg>
      <span style="font-size: 15px; color: #8e8e93;">Cerca utenti per username…</span>
    </div>
  </div>
`;

function feedRow(letter, html, time, poster) {
  return `      <div style="display: flex; align-items: center; gap: 12px; padding: 10px 12px;" class="z-card">
        ${av(letter, 38, 15)}
        <div style="display: flex; flex-direction: column; gap: 3px; flex-grow: 1; min-width: 0;">
          <div class="z-feed">${html}</div>
          <div style="font-size: 11px; color: #8e8e93;">${time}</div>
        </div>
        <img class="z-thumb" src="${poster}" alt="">
      </div>`;
}

const friends = head + topbar + `
  <div style="position: absolute; left: 0; top: 196px; width: 390px; display: flex; flex-direction: column; gap: 26px; padding: 0 20px; box-sizing: border-box;">

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        <div class="z-h2">Richieste ricevute</div>
        <div style="min-width: 22px; height: 22px; padding: 0 7px; border-radius: 11px; background: #8b5cf6; color: #ffffff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">1</div>
      </div>
      <div class="z-card" style="display: flex; align-items: center; gap: 12px; padding: 10px 12px;">
        ${av("D", 42, 16)}
        <div style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0;">
          <div style="font-size: 15px; font-weight: 600; color: #ffffff;">Davide</div>
          <div style="font-size: 12px; color: #8e8e93;">@davide_r</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <div style="height: 36px; padding: 0 14px; border-radius: 18px; background: #8b5cf6; color: #ffffff; font-size: 13px; font-weight: 600; display: flex; align-items: center;">Accetta</div>
          <div style="width: 36px; height: 36px; border-radius: 18px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.10); display: flex; align-items: center; justify-content: center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg></div>
        </div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; align-items: baseline; gap: 8px;">
        <div class="z-h2">I tuoi amici</div>
        <div style="font-size: 14px; color: #8e8e93;">5</div>
      </div>
      <div style="display: flex; gap: 14px; overflow: hidden;">
        ${[["E", "Elena"], ["M", "Marco"], ["G", "Giulia"], ["L", "Luca"], ["S", "Sara"]].map(([l, n]) => `<div style="display: flex; flex-direction: column; align-items: center; gap: 6px; width: 60px; flex-shrink: 0;">${av(l, 56, 20)}<div style="font-size: 12px; color: rgba(255,255,255,0.8);">${n}</div></div>`).join("\n        ")}
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div class="z-h2">Attività degli amici</div>
${[
  feedRow("E", "<b>Elena</b> ha finito <b>Silo</b> e gli ha dato <b style=\"color: #a78bfa;\">9</b>", "2h", "p15.jpg"),
  feedRow("M", "<b>Marco</b> sta guardando <b>Lanterns</b>, S1E3", "5h", "p04.jpg"),
  feedRow("G", "<b>Giulia</b> ti ha consigliato <b>L'uomo dei sussurri</b>", "1g", "p01.jpg"),
  feedRow("L", "<b>Luca</b> ha recensito <b>Odissea</b>", "1g", "p02.jpg"),
].join("\n")}
    </div>
  </div>
` + nav("Amici") + tail;
fs.writeFileSync("Friends.dc.html", friends);

const empty = head + topbar + `
  <div style="position: absolute; left: 20px; top: 196px; width: 350px; display: flex; flex-direction: column; gap: 26px;">
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div class="z-h2">Attività degli amici</div>
      <div class="z-card" style="display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 28px 22px 22px; text-align: center;">
        <div style="display: flex; align-items: center;">
          ${av("E", 48, 18)}<div style="margin-left: -12px;">${av("M", 48, 18)}</div><div style="margin-left: -12px;">${av("G", 48, 18)}</div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: #ffffff;">Non hai ancora amici su Zapp</div>
          <div style="font-size: 14px; line-height: 1.45; color: #8e8e93; text-wrap: pretty;">Cerca i tuoi amici per username qui sopra, o invitali con il tuo link.</div>
        </div>
        <div style="width: 100%; display: flex; flex-direction: column; gap: 10px;">
          <div style="height: 48px; border-radius: 14px; background: #1c1c1e; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; box-sizing: border-box;">
            <span style="font-size: 13px; color: #a78bfa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">zapp.app/signup?ref=cinefilo_92</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"></path></svg>
          </div>
          <div style="height: 50px; border-radius: 25px; background: #8b5cf6; color: #ffffff; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 8px 28px rgba(139,92,246,0.35);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"></path><path d="M16 6l-4-4-4 4"></path><path d="M12 2v13"></path></svg>
            <span>Invita un amico</span>
          </div>
        </div>
      </div>
    </div>
  </div>
` + nav("Amici") + tail;
fs.writeFileSync("FriendsEmpty.dc.html", empty);
console.log("ok friends");

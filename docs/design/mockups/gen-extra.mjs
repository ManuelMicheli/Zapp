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
    .z-h1 { font-size: 34px; font-weight: 700; letter-spacing: -0.045em; line-height: 1; color: #ffffff; }
    .z-h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff; }
    .z-card { border-radius: 20px; background: #0e0e12; border: 1px solid rgba(255,255,255,0.07); }
    .z-glass { background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.14); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
    .z-muted { color: #8e8e93; }
    .z-poster { width: 112px; height: 168px; border-radius: 14px; object-fit: cover; display: block; background: #1c1c1e; }
    .z-name { font-size: 13px; font-weight: 500; color: #ffffff; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .z-av { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #ffffff; flex-shrink: 0; }
  </style>
</helmet>
<div style="width: 390px; height: ${h}px; background: #000000; color: #ffffff; position: relative; overflow: hidden; box-sizing: border-box;">
`;
const tail = `</div>
</x-dc>
</body>
</html>
`;

const glow = `  <div style="position: absolute; left: -140px; top: -180px; width: 460px; height: 380px; border-radius: 50%; background: radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%); filter: blur(44px);"></div>\n`;
const back = `<div class="z-glass" style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg></div>`;
const check = (c = "#c4b5fd") => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7"></path></svg>`;
const grads = { E: "linear-gradient(135deg, #f0abfc, #7c3aed)", M: "linear-gradient(135deg, #67e8f9, #4c1d95)", G: "linear-gradient(135deg, #fde68a, #a855f7)", L: "linear-gradient(135deg, #a78bfa, #1e1b4b)", D: "linear-gradient(135deg, #86efac, #5b21b6)" };
const av = (l, size, fs) => `<div class="z-av" style="width: ${size}px; height: ${size}px; font-size: ${fs}px; background: ${grads[l]};">${l}</div>`;

/* ---------- Stagione ---------- */
const ep = (n, img, name, meta, state) => `    <div class="z-card" style="display: flex; gap: 12px; padding: 10px; ${state === "seen" ? "opacity: 0.55;" : ""} ${state === "next" ? "border-color: rgba(139,92,246,0.55); box-shadow: 0 0 0 3px rgba(139,92,246,0.14);" : ""}">
      <div style="position: relative; width: 118px; height: 66px; border-radius: 10px; overflow: hidden; flex-shrink: 0; background: #1c1c1e;">
        <img src="${img}" alt="" style="width: 118px; height: 66px; object-fit: cover; display: block;">
        ${state === "seen" ? `<div style="position: absolute; left: 0; top: 0; width: 118px; height: 66px; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;">${check("#c4b5fd").replace('width="14" height="14"', 'width="22" height="22"')}</div>` : ""}
        ${state === "next" ? `<div style="position: absolute; left: 6px; top: 6px; height: 20px; padding: 0 8px; border-radius: 10px; background: #8b5cf6; color: #ffffff; font-size: 10px; font-weight: 700; display: flex; align-items: center;">Prossimo</div>` : ""}
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0; justify-content: center;">
        <div style="font-size: 14px; font-weight: 600; color: #ffffff; line-height: 1.25;"><span class="z-muted">${n}.</span> ${name}</div>
        <div style="font-size: 12px;" class="z-muted">${meta}</div>
      </div>
    </div>`;

const season = head(844) + `
  <div style="position: absolute; left: 0; top: 0; width: 390px; height: 300px; overflow: hidden;">
    <img src="season2.jpg" alt="" style="width: 390px; height: 300px; object-fit: cover; object-position: 50% 30%; display: block; filter: blur(24px); transform: scale(1.3); opacity: 0.6;">
    <div style="position: absolute; left: 0; top: 0; width: 390px; height: 300px; background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 50%, #000000 100%);"></div>
  </div>
  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; align-items: center; gap: 14px; padding: 58px 20px 0; box-sizing: border-box;">
    ${back}
    <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
      <a href="#" style="font-size: 13px; font-weight: 500;">Silo</a>
      <div style="font-size: 26px; font-weight: 700; letter-spacing: -0.04em; line-height: 1; color: #ffffff;">Stagione 2</div>
    </div>
  </div>
  <div style="position: absolute; left: 20px; top: 132px; width: 350px; display: flex; align-items: center; justify-content: space-between;">
    <div style="font-size: 13px;" class="z-muted">10 episodi, 2024</div>
    <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #c4b5fd; font-weight: 500;"><div style="width: 90px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12); overflow: hidden;"><div style="width: 40%; height: 4px; background: #8b5cf6;"></div></div><span>4 / 10</span></div>
  </div>
  <div style="position: absolute; left: 20px; top: 168px; width: 350px; display: flex; flex-direction: column; gap: 8px;">
${[
  ep(1, "ep1.jpg", "Il tecnico", "48 min, 14 nov 2024", "seen"),
  ep(2, "ep2.jpg", "Ordine", "42 min, 21 nov 2024", "seen"),
  ep(3, "ep3.jpg", "Solo", "54 min, 26 nov 2024", "seen"),
  ep(4, "ep4.jpg", "L'armonium", "54 min, 5 dic 2024", "seen"),
  ep(5, "ep5.jpg", "Discesa", "49 min, 12 dic 2024", "next"),
  ep(6, "ep6.jpg", "Barricate", "43 min, 19 dic 2024", ""),
].join("\n")}
  </div>
  <div style="position: absolute; left: 0; bottom: 0; width: 390px; height: 90px; background: linear-gradient(180deg, rgba(0,0,0,0) 0%, #000000 100%); pointer-events: none;"></div>
` + tail;
fs.writeFileSync("Season.dc.html", season);

/* ---------- Notifiche ---------- */
const notifIcon = (kind) => {
  const m = {
    request: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M19 8v6M22 11h-6"></path>`,
    accepted: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="m16 11 2 2 4-4"></path>`,
    rec: `<path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z"></path>`,
    comment: `<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.4A8 8 0 1 1 21 12z"></path>`,
  };
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${m[kind]}</svg>`;
};
const notif = (l, html, when, kind, unread, poster) => `    <div class="z-card" style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; ${unread ? "background: #121218; border-color: rgba(139,92,246,0.25);" : ""}">
      <div style="position: relative; flex-shrink: 0;">
        ${av(l, 40, 15)}
        <div style="position: absolute; right: -6px; bottom: -4px; width: 24px; height: 24px; border-radius: 50%; background: #0e0e12; border: 2px solid #000000; display: flex; align-items: center; justify-content: center;">${notifIcon(kind)}</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 3px; flex-grow: 1; min-width: 0;">
        <div style="font-size: 14px; line-height: 1.35; color: ${unread ? "#ffffff" : "rgba(255,255,255,0.7)"};">${html}</div>
        <div style="font-size: 11px;" class="z-muted">${when}</div>
      </div>
      ${poster ? `<img src="${poster}" alt="" style="width: 34px; height: 51px; border-radius: 7px; object-fit: cover; display: block; flex-shrink: 0;">` : unread ? `<div style="width: 8px; height: 8px; border-radius: 50%; background: #8b5cf6; flex-shrink: 0;"></div>` : ""}
    </div>`;

const notifications = head(844) + glow + `
  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; align-items: center; gap: 14px; padding: 58px 20px 0; box-sizing: border-box;">
    ${back}
    <div class="z-h1">Notifiche</div>
  </div>
  <div style="position: absolute; left: 20px; top: 128px; width: 350px; display: flex; flex-direction: column; gap: 16px;">
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div style="font-size: 12px; font-weight: 600; color: #a78bfa; padding: 0 4px;">Nuove</div>
${[
  notif("D", "<b style=\"font-weight: 600;\">Davide</b> ti ha inviato una richiesta di amicizia", "10 minuti fa", "request", true, null),
  notif("G", "<b style=\"font-weight: 600;\">Giulia</b> ti ha consigliato <b style=\"font-weight: 600;\">L'uomo dei sussurri</b>", "2 ore fa", "rec", true, "p01.jpg"),
].join("\n")}
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div style="font-size: 12px; font-weight: 600; padding: 0 4px;" class="z-muted">Precedenti</div>
${[
  notif("L", "<b style=\"font-weight: 600;\">Luca</b> ha commentato la tua recensione di <b style=\"font-weight: 600;\">Silo</b>", "ieri", "comment", false, "p15.jpg"),
  notif("M", "<b style=\"font-weight: 600;\">Marco</b> ha accettato la tua richiesta", "3 giorni fa", "accepted", false, null),
  notif("E", "<b style=\"font-weight: 600;\">Elena</b> ti ha consigliato <b style=\"font-weight: 600;\">Odissea</b>", "5 giorni fa", "rec", false, "p02.jpg"),
].join("\n")}
    </div>
  </div>
` + nav("Amici") + tail;
fs.writeFileSync("Notifications.dc.html", notifications);

/* ---------- Import Netflix: intro ---------- */
const step = (n, html) => `      <div style="display: flex; gap: 12px; align-items: flex-start;">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: rgba(139,92,246,0.18); color: #c4b5fd; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${n}</div>
        <div style="font-size: 14px; line-height: 1.45; color: rgba(255,255,255,0.8); padding-top: 2px;">${html}</div>
      </div>`;
const importIntro = head(844) + glow + `
  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; align-items: center; gap: 14px; padding: 58px 20px 0; box-sizing: border-box;">
    ${back}
    <div class="z-h1" style="font-size: 28px;">Importa da Netflix</div>
  </div>
  <div style="position: absolute; left: 20px; top: 128px; width: 350px; display: flex; flex-direction: column; gap: 16px;">
    <div style="display: flex; align-items: center; gap: 14px; padding: 4px 0 6px;">
      <div style="width: 56px; height: 56px; border-radius: 16px; background: #E50914; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 800; color: #ffffff; box-shadow: 0 12px 30px rgba(229,9,20,0.35);">N</div>
      <div style="font-size: 15px; line-height: 1.45; color: rgba(255,255,255,0.8); text-wrap: pretty;">Porta in Zapp tutto quello che hai già visto. Ci vuole un minuto.</div>
    </div>
    <div class="z-card" style="display: flex; flex-direction: column; gap: 14px; padding: 18px;">
      <div style="font-size: 15px; font-weight: 600; color: #ffffff;">Come scaricare il tuo storico</div>
${step(1, "Netflix, poi <b style=\"font-weight: 600; color: #ffffff;\">Account</b>, <b style=\"font-weight: 600; color: #ffffff;\">Profilo</b>, <b style=\"font-weight: 600; color: #ffffff;\">Attività di visione</b>")}
${step(2, "In fondo alla pagina, <b style=\"font-weight: 600; color: #ffffff;\">Scarica tutto</b>")}
${step(3, "Carica qui il file <span style=\"color: #c4b5fd;\">NetflixViewingHistory.csv</span>")}
    </div>
    <div style="border-radius: 22px; border: 1.5px dashed rgba(139,92,246,0.5); background: rgba(139,92,246,0.06); display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px 20px;">
      <div style="width: 52px; height: 52px; border-radius: 14px; background: rgba(139,92,246,0.18); display: flex; align-items: center; justify-content: center;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M12 18v-6M9 15l3-3 3 3"></path></svg>
      </div>
      <div style="font-size: 15px; font-weight: 600; color: #ffffff;">Trascina qui il CSV</div>
      <div style="font-size: 12px;" class="z-muted">max 5MB</div>
    </div>
    <div style="height: 54px; border-radius: 27px; background: #8b5cf6; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; box-shadow: 0 8px 28px rgba(139,92,246,0.35);">Scegli il file CSV</div>
    <div style="font-size: 12px; line-height: 1.5; text-align: center; padding: 0 10px;" class="z-muted">Riconoscimento dei titoli su TMDB, può richiedere qualche secondo.</div>
  </div>
` + tail;
fs.writeFileSync("ImportNetflix.dc.html", importIntro);

/* ---------- Import Netflix: revisione ---------- */
const matchRow = (img, name, meta, on = true) => `    <div class="z-card" style="display: flex; align-items: center; gap: 12px; padding: 8px 12px 8px 8px;">
      <div style="width: 24px; height: 24px; border-radius: 8px; ${on ? "background: #8b5cf6;" : "border: 1.5px solid rgba(255,255,255,0.25);"} display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-left: 4px;">${on ? check("#ffffff") : ""}</div>
      <img src="${img}" alt="" style="width: 36px; height: 54px; border-radius: 7px; object-fit: cover; display: block; flex-shrink: 0;">
      <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0; flex-grow: 1;">
        <div class="z-name" style="font-size: 14px; font-weight: 600;">${name}</div>
        <div style="font-size: 12px;" class="z-muted">${meta}</div>
      </div>
    </div>`;
const unmatchedRow = (name) => `    <div class="z-card" style="display: flex; align-items: center; gap: 12px; padding: 10px 10px 10px 14px;">
      <div style="font-size: 14px; color: rgba(255,255,255,0.75); min-width: 0; flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</div>
      <div class="z-glass" style="height: 34px; padding: 0 12px; border-radius: 17px; font-size: 12px; font-weight: 600; color: #ffffff; display: flex; align-items: center; flex-shrink: 0;">Cerca a mano</div>
    </div>`;
const importReview = head(844) + `
  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; align-items: center; gap: 14px; padding: 58px 20px 0; box-sizing: border-box;">
    ${back}
    <div class="z-h1" style="font-size: 28px;">Importa da Netflix</div>
  </div>
  <div style="position: absolute; left: 20px; top: 122px; width: 350px; display: flex; flex-direction: column; gap: 18px;">
    <div style="display: flex; align-items: baseline; gap: 10px;">
      <div style="font-size: 44px; font-weight: 800; letter-spacing: -0.05em; line-height: 1; color: #ffffff;">38</div>
      <div style="font-size: 15px; color: rgba(255,255,255,0.7);">titoli riconosciuti su 45</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
${[
  matchRow("p15.jpg", "Silo", "Serie, fino a S2E4"),
  matchRow("p18.jpg", "The Gentlemen", "Serie, fino a S1E8"),
  matchRow("p05.jpg", "Obsession", "Film"),
  matchRow("p06.jpg", "Resident Evil", "Serie, fino a S1E2", false),
  matchRow("p11.jpg", "Bleach", "Serie, fino a S1E13"),
].join("\n")}
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      <div style="font-size: 13px; font-weight: 600; padding: 0 4px;" class="z-muted">Non riconosciuti (7)</div>
${[unmatchedRow("Zerocalcare: Strappare lungo i bordi: Stagione 1: Episodio 3"), unmatchedRow("Lupin: Parte 3: Capitolo 2")].join("\n")}
    </div>
  </div>
  <div style="position: absolute; left: 0; bottom: 0; width: 390px; height: 140px; background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 55%, #000000 100%); pointer-events: none;"></div>
  <div style="position: absolute; left: 20px; bottom: 26px; width: 350px; height: 56px; border-radius: 28px; background: #8b5cf6; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; box-shadow: 0 10px 30px rgba(139,92,246,0.45);">Importa 37 titoli</div>
` + tail;
fs.writeFileSync("ImportReview.dc.html", importReview);

/* ---------- Profilo pubblico ---------- */
const shelfCard = (img, name, rating) => `        <div style="display: flex; flex-direction: column; gap: 8px; width: 112px; flex-shrink: 0;">
          <img class="z-poster" src="${img}" alt="">
          <div style="display: flex; flex-direction: column; gap: 2px;"><div class="z-name">${name}</div>${rating ? `<div style="font-size: 11px; font-weight: 600; color: #a78bfa;">★ ${rating}</div>` : ""}</div>
        </div>`;
const publicProfile = head(844) + `
  <div style="position: absolute; left: 0; top: 0; width: 390px; height: 320px; overflow: hidden;">
    <img src="p01.jpg" alt="" style="width: 390px; height: 320px; object-fit: cover; object-position: 50% 20%; display: block; filter: blur(30px) saturate(1.2); transform: scale(1.4); opacity: 0.5;">
    <div style="position: absolute; left: 0; top: 0; width: 390px; height: 320px; background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 55%, #000000 100%);"></div>
  </div>
  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; align-items: center; justify-content: space-between; padding: 58px 20px 0; box-sizing: border-box;">
    ${back}
    <div class="z-glass" style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;"><svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg></div>
  </div>
  <div style="position: absolute; left: 0; top: 118px; width: 390px; display: flex; flex-direction: column; align-items: center; gap: 14px;">
    <div style="box-shadow: 0 20px 50px rgba(0,0,0,0.6); border-radius: 50%;">${av("E", 104, 44)}</div>
    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
      <div style="font-size: 30px; font-weight: 800; letter-spacing: -0.05em; line-height: 1; color: #ffffff;">Elena</div>
      <div style="font-size: 14px; color: rgba(255,255,255,0.55);">@elena_v</div>
    </div>
    <div style="display: flex; align-items: center; gap: 10px;">
      <div style="height: 40px; padding: 0 18px; border-radius: 20px; background: rgba(139,92,246,0.18); border: 1px solid rgba(139,92,246,0.45); color: #c4b5fd; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px;">${check("#c4b5fd")}<span>Amici</span></div>
      <div class="z-glass" style="height: 40px; padding: 0 16px; border-radius: 20px; color: #ffffff; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z"></path></svg>
        <span>Consiglia</span>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 24px; font-size: 13px; color: rgba(255,255,255,0.6);">
      <span><b style="color: #ffffff; font-weight: 700;">54</b> visti</span><span><b style="color: #ffffff; font-weight: 700;">3</b> in corso</span><span><b style="color: #ffffff; font-weight: 700;">8</b> amici</span>
    </div>
  </div>
  <div style="position: absolute; left: 0; top: 402px; width: 390px; display: flex; flex-direction: column; gap: 28px;">
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="z-h2" style="padding: 0 20px;">Sto guardando</div>
      <div style="display: flex; gap: 12px; padding: 0 20px; overflow: hidden;">
${[shelfCard("p01.jpg", "L'uomo dei sussurri"), shelfCard("p04.jpg", "Lanterns"), shelfCard("p17.jpg", "Reacher"), shelfCard("p09.jpg", "The Dog Stars")].join("\n")}
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="z-h2" style="padding: 0 20px;">Visti di recente</div>
      <div style="display: flex; gap: 12px; padding: 0 20px; overflow: hidden;">
${[shelfCard("p15.jpg", "Silo", 9), shelfCard("p02.jpg", "Odissea", 8), shelfCard("p13.jpg", "The Shards", 7), shelfCard("p08.jpg", "The Runner", 8)].join("\n")}
      </div>
    </div>
  </div>
` + tail;
fs.writeFileSync("PublicProfile.dc.html", publicProfile);
console.log("ok extra");

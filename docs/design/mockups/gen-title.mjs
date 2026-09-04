import fs from "node:fs";

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
    .z-h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff; }
    .z-card { border-radius: 20px; background: #0e0e12; border: 1px solid rgba(255,255,255,0.07); }
    .z-glass { background: rgba(255,255,255,0.10); border: 1px solid rgba(255,255,255,0.14); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
    .z-sec { display: flex; flex-direction: column; gap: 12px; padding: 0 20px; }
    .z-muted { color: #8e8e93; }
  </style>
</helmet>
<div style="width: 390px; height: ${h}px; background: #000000; color: #ffffff; position: relative; overflow: hidden; box-sizing: border-box;">
`;
const tail = `</div>
</x-dc>
</body>
</html>
`;

const iconBtn = (svg) => `<div class="z-glass" style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">${svg}</div>`;
const stroke = (d, w = 1.8) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const hero = `
  <div style="position: absolute; left: 0; top: 0; width: 390px; height: 440px; overflow: hidden;">
    <img src="bd_silo.jpg" alt="" style="width: 390px; height: 440px; object-fit: cover; display: block; transform: scale(1.1); transform-origin: 50% 20%;">
    <div style="position: absolute; left: 0; top: 0; width: 390px; height: 440px; background: linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.4) 55%, rgba(0,0,0,0.92) 80%, #000000 100%);"></div>
  </div>
  <div style="position: absolute; left: 0; top: 0; width: 390px; display: flex; align-items: center; justify-content: space-between; padding: 58px 20px 0; box-sizing: border-box;">
    ${iconBtn(stroke(`<path d="M15 5l-7 7 7 7"></path>`, 2))}
    <div style="display: flex; gap: 10px;">
      ${iconBtn(stroke(`<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"></path><path d="M16 6l-4-4-4 4"></path><path d="M12 2v13"></path>`))}
    </div>
  </div>

  <div style="position: absolute; left: 20px; top: 296px; width: 350px; display: flex; align-items: flex-end; gap: 16px;">
    <img src="p15.jpg" alt="" style="width: 110px; height: 165px; border-radius: 14px; object-fit: cover; display: block; box-shadow: 0 20px 50px rgba(0,0,0,0.7); border: 1px solid rgba(255,255,255,0.08); flex-shrink: 0;">
    <div style="display: flex; flex-direction: column; gap: 10px; padding-bottom: 4px; min-width: 0;">
      <div style="font-size: 38px; font-weight: 800; letter-spacing: -0.05em; line-height: 1; color: #ffffff;">Silo</div>
      <div style="font-size: 13px; color: rgba(255,255,255,0.7);">2023, 4 stagioni, 30 episodi</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        <div class="z-glass" style="height: 28px; padding: 0 11px; border-radius: 14px; font-size: 12px; font-weight: 500; color: #ffffff; display: flex; align-items: center;">Sci-Fi &amp; Fantasy</div>
        <div class="z-glass" style="height: 28px; padding: 0 11px; border-radius: 14px; font-size: 12px; font-weight: 500; color: #ffffff; display: flex; align-items: center;">Dramma</div>
      </div>
    </div>
  </div>
`;

const progress = `
  <div style="position: absolute; left: 20px; top: 492px; width: 350px;" class="z-card">
    <div style="display: flex; flex-direction: column; gap: 12px; padding: 16px 18px;">
      <div style="display: flex; align-items: baseline; justify-content: space-between;">
        <div style="display: flex; align-items: baseline; gap: 8px;"><span style="font-size: 12px; font-weight: 500; color: #a78bfa;">Sei a</span><span style="font-size: 24px; font-weight: 800; letter-spacing: -0.04em; color: #ffffff;">S2 E4</span></div>
        <div style="font-size: 13px;" class="z-muted">16 episodi rimasti</div>
      </div>
      <div style="height: 6px; border-radius: 3px; background: rgba(255,255,255,0.10); overflow: hidden;"><div style="width: 47%; height: 6px; border-radius: 3px; background: linear-gradient(90deg, #a78bfa, #7c3aed);"></div></div>
      <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px;" class="z-muted"><span>Prossimo: S2 E5</span><a href="#" style="font-weight: 500;">Segna progresso</a></div>
    </div>
  </div>
`;

const where = `
  <div style="position: absolute; left: 0; top: 612px; width: 390px;" class="z-sec">
    <div class="z-h2">Dove guardarlo</div>
    <div class="z-card" style="display: flex; align-items: center; gap: 14px; padding: 12px 12px 12px 14px;">
      <img src="prov350.jpg" alt="" style="width: 44px; height: 44px; border-radius: 12px; object-fit: cover; display: block; flex-shrink: 0;">
      <div style="display: flex; flex-direction: column; gap: 2px; flex-grow: 1; min-width: 0;">
        <div style="font-size: 15px; font-weight: 600; color: #ffffff;">Apple TV+</div>
        <div style="font-size: 12px;" class="z-muted">Incluso nell'abbonamento</div>
      </div>
      <div style="height: 40px; padding: 0 18px; border-radius: 20px; background: #8b5cf6; color: #ffffff; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; box-shadow: 0 8px 24px rgba(139,92,246,0.35);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"></path></svg>
        <span>Apri</span>
      </div>
    </div>
    <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.7);">
      <div style="display: flex; align-items: center;">
        <div style="width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #f0abfc, #7c3aed); border: 2px solid #000000;"></div>
        <div style="width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #67e8f9, #4c1d95); border: 2px solid #000000; margin-left: -8px;"></div>
      </div>
      <span>Guardato da <b style="color: #ffffff; font-weight: 600;">Elena</b> e <b style="color: #ffffff; font-weight: 600;">Marco</b></span>
    </div>
  </div>
`;

const rating = `
  <div style="position: absolute; left: 20px; top: 752px; width: 350px; display: flex; align-items: center; justify-content: space-between;">
    <div style="display: flex; flex-direction: column; gap: 2px;">
      <div style="display: flex; align-items: baseline; gap: 6px;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#facc15" aria-hidden="true" style="align-self: center;"><path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z"></path></svg>
        <span style="font-size: 22px; font-weight: 700; letter-spacing: -0.03em; color: #ffffff;">8,2</span>
        <span style="font-size: 13px;" class="z-muted">/ 10, 2.553 voti</span>
      </div>
      <div style="font-size: 10px; color: #6e6e73;">Voto TMDB</div>
    </div>
    <div class="z-glass" style="height: 40px; padding: 0 16px; border-radius: 20px; font-size: 14px; font-weight: 600; color: #ffffff; display: flex; align-items: center; gap: 8px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M10 9.5v5l4-2.5z" fill="#ffffff" stroke="none"></path></svg>
      <span>Trailer</span>
    </div>
  </div>
`;

const overview = `
  <div style="position: absolute; left: 0; top: 830px; width: 390px;" class="z-sec">
    <div class="z-h2">Trama</div>
    <div style="font-size: 15px; line-height: 1.55; color: rgba(255,255,255,0.78); text-wrap: pretty;">In un futuro tossico e in rovina, migliaia di persone vivono in un enorme silo sotterraneo. Dopo la violazione di una regola cardine da parte dello sceriffo e la morte misteriosa di alcuni residenti, Juliette, un tecnico, comincia a svelare dei segreti scioccanti e la verità sul silo.</div>
  </div>
`;

const castItem = (img, name, role) => `      <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; width: 84px; flex-shrink: 0; text-align: center;">
        <img src="${img}" alt="" style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; object-position: 50% 20%; display: block; background: #1c1c1e; border: 1px solid rgba(255,255,255,0.08);">
        <div style="display: flex; flex-direction: column; gap: 2px;"><div style="font-size: 12px; font-weight: 600; color: #ffffff; line-height: 1.2;">${name}</div><div style="font-size: 11px; line-height: 1.2;" class="z-muted">${role}</div></div>
      </div>`;
const cast = `
  <div style="position: absolute; left: 0; top: 1000px; width: 390px; display: flex; flex-direction: column; gap: 12px;">
    <div class="z-h2" style="padding: 0 20px;">Cast</div>
    <div style="display: flex; gap: 10px; padding: 0 20px; overflow: hidden;">
${[castItem("cast1.jpg", "Rebecca Ferguson", "Juliette Nichols"), castItem("cast2.jpg", "Common", "Robert Sims"), castItem("cast3.jpg", "Chinaza Uche", "Paul Billings"), castItem("cast4.jpg", "Ashley Zukerman", "Daniel Keene")].join("\n")}
    </div>
  </div>
`;

const seasonRow = (img, name, meta, done) => `    <div class="z-card" style="display: flex; align-items: center; gap: 12px; padding: 10px 14px 10px 10px;">
      <img src="${img}" alt="" style="width: 44px; height: 66px; border-radius: 8px; object-fit: cover; display: block; flex-shrink: 0;">
      <div style="display: flex; flex-direction: column; gap: 3px; flex-grow: 1; min-width: 0;">
        <div style="font-size: 15px; font-weight: 600; color: #ffffff;">${name}</div>
        <div style="font-size: 12px;" class="z-muted">${meta}</div>
      </div>
      ${done === "done" ? `<div style="width: 24px; height: 24px; border-radius: 50%; background: rgba(139,92,246,0.2); display: flex; align-items: center; justify-content: center;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c4b5fd" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7"></path></svg></div>` : done === "now" ? `<div style="font-size: 12px; font-weight: 600; color: #a78bfa;">4 / 10</div>` : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>`}
    </div>`;
const seasons = `
  <div style="position: absolute; left: 0; top: 1160px; width: 390px;" class="z-sec">
    <div class="z-h2">Stagioni</div>
${seasonRow("season1.jpg", "Stagione 1", "10 episodi, 2023", "done")}
${seasonRow("season2.jpg", "Stagione 2", "10 episodi, 2024", "now")}
${seasonRow("season3.jpg", "Stagione 3", "10 episodi, 2026", "")}
  </div>
`;

const reviews = `
  <div style="position: absolute; left: 0; top: 1470px; width: 390px;" class="z-sec">
    <div style="display: flex; align-items: baseline; justify-content: space-between;">
      <div class="z-h2">Recensioni</div>
      <div style="font-size: 13px;" class="z-muted">Voto Zapp <b style="color: #a78bfa; font-weight: 700;">8,7</b> su 3 voti</div>
    </div>
    <div class="z-card" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px;">
      <div style="font-size: 14px; color: rgba(255,255,255,0.7);">Cosa ne pensi?</div>
      <div style="display: flex; gap: 4px;">${Array.from({ length: 5 }).map(() => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z"></path></svg>`).join("")}</div>
    </div>
    <div class="z-card" style="display: flex; flex-direction: column; gap: 10px; padding: 14px;">
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #f0abfc, #7c3aed); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: #ffffff;">E</div>
        <div style="display: flex; flex-direction: column; gap: 1px; flex-grow: 1;"><div style="font-size: 14px; font-weight: 600; color: #ffffff;">Elena</div><div style="font-size: 11px;" class="z-muted">2 giorni fa</div></div>
        <div style="font-size: 14px; font-weight: 700; color: #a78bfa;">★ 9</div>
      </div>
      <div style="font-size: 14px; line-height: 1.5; color: rgba(255,255,255,0.8);">La seconda stagione alza il livello. Ritmo lento ma ogni episodio aggiunge un pezzo.</div>
      <div style="display: flex; gap: 16px; font-size: 12px;" class="z-muted"><span>♡ 4</span><span>2 commenti</span></div>
    </div>
  </div>
`;

const actionBar = `
  <div style="position: absolute; left: 0; bottom: 0; width: 390px; height: 150px; background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 55%, #000000 100%); pointer-events: none;"></div>
  <div style="position: absolute; left: 16px; bottom: 22px; width: 358px; display: flex; gap: 8px;">
    <div style="flex-grow: 1; height: 56px; border-radius: 28px; background: #8b5cf6; color: #ffffff; display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 10px 30px rgba(139,92,246,0.45);">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4.5 4.5L19 7"></path></svg>
      <span>Prossimo episodio</span>
    </div>
    <div style="width: 56px; height: 56px; border-radius: 28px; background: rgba(28,28,30,0.85); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l2.94 6.26 6.87.86-5.06 4.73 1.3 6.79L12 17.27l-6.05 3.37 1.3-6.79L2.19 9.12l6.87-.86L12 2z"></path></svg>
    </div>
    <div style="width: 56px; height: 56px; border-radius: 28px; background: rgba(28,28,30,0.85); border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>
    </div>
  </div>
`;

const content = hero + progress + where + rating + overview + cast + seasons + reviews;
fs.writeFileSync("Title.dc.html", head(844) + content + actionBar + tail);
fs.writeFileSync("TitleFull.dc.html", head(1740) + content + tail);
console.log("ok title");

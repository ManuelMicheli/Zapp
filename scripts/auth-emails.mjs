/**
 * Email di autenticazione con l'aspetto di Zapp.
 *
 * Un solo posto genera i sei modelli (conferma, magic link, recupero, invito,
 * cambio email, riautenticazione): il guscio HTML e' condiviso, cambia solo il
 * testo. I file finiscono in docs/auth/email-templates/ per poterli incollare a
 * mano nella dashboard; con --push vanno su Supabase via Management API.
 *
 *   node scripts/auth-emails.mjs                  # scrive i file
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/auth-emails.mjs --push
 *
 * Il token e' un Personal Access Token: https://supabase.com/dashboard/account/tokens
 * Il ref del progetto viene da NEXT_PUBLIC_SUPABASE_URL (o da SUPABASE_PROJECT_REF).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs", "auth", "email-templates");

/**
 * Dominio pubblico dell'app: le immagini di una email vanno per URL.
 * Stanno sotto `/email/` perche' e' l'unico percorso servito con
 * `Cross-Origin-Resource-Policy: cross-origin` (vedi next.config.ts): tutto il
 * resto dell'app e' `same-origin` e nel client di posta non si vedrebbe.
 */
const APP_URL = (process.env.ZAPP_PUBLIC_URL ?? "https://zapp-mu.vercel.app").replace(
  /\/$/,
  "",
);
/**
 * Testata: il muro di locandine che scorre, come su login e registrazione.
 * E' una GIF (`scripts/email-wall.mjs`) perche' nelle email non ci sono ne'
 * animazioni CSS ne' JavaScript; chi non anima le GIF vede il primo fotogramma,
 * che e' comunque il muro. Sta a 480x240 e viene mostrata a 600x300.
 */
const WALL = `${APP_URL}/email/wall.gif`;
const WALL_W = 600;
const WALL_H = 300;

const ACCENT = "#c5baf4";
const BG = "#050506";
const TEXT = "#f5f5f7";
const MUTED = "rgba(255,255,255,0.62)";
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";
const CLAIM = "Zapp &middot; i tuoi film e le tue serie, e dove guardarli";

/**
 * Guscio comune. Tabelle e stili inline: nelle email non esistono ne' flexbox
 * ne' un <style> affidabile (Gmail lo tiene, Outlook no). `role="presentation"`
 * perche' non sono tabelle di dati.
 */
function shell({ preheader, card, footer }) {
  return `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <meta name="supported-color-schemes" content="dark light" />
    <title>Zapp</title>
  </head>
  <body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:${FONT};">
    <div style="display:none;font-size:1px;color:${BG};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};">
      <tr>
        <td align="center" style="padding:24px 16px 48px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:${WALL_W}px;">
            <tr>
              <td style="line-height:0;font-size:0;">
                <img src="${WALL}" width="${WALL_W}" height="${WALL_H}" alt="Zapp" style="display:block;width:100%;max-width:${WALL_W}px;height:auto;border-radius:20px;" />
              </td>
            </tr>
            <tr>
              <!-- Nessuna scatola attorno al testo: sotto la testata il contenuto sta
                   direttamente sul fondo, come nel foglio di login. -->
              <td style="padding:30px 8px 0;">
${card}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 8px 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
                ${footer}<br />
                <span style="color:#6b6b75;">${CLAIM}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

/** Modello con un bottone: e' la forma di cinque email su sei. */
function linkTemplate({ preheader, heading, body, cta, footer }) {
  const url = "{{ .ConfirmationURL }}";
  return shell({
    preheader,
    footer,
    card: `                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:${TEXT};">${heading}</h1>
                <p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:${MUTED};">${body}</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                  <tr>
                    <td align="center" style="border-radius:14px;background:${ACCENT};">
                      <a href="${url}" style="display:block;padding:16px 24px;font-size:16px;font-weight:600;color:#0b0b0d;text-decoration:none;border-radius:14px;">${cta}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
                  Se il bottone non funziona, copia questo indirizzo nel browser:<br />
                  <a href="${url}" style="color:${ACCENT};text-decoration:none;word-break:break-all;">${url}</a>
                </p>`,
  });
}

/** Modello a codice (riautenticazione): nessun link, solo le cifre. */
function codeTemplate({ preheader, heading, body, footer }) {
  return shell({
    preheader,
    footer,
    card: `                <div style="text-align:center;">
                  <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;font-weight:600;letter-spacing:-0.02em;color:${TEXT};">${heading}</h1>
                  <p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:${MUTED};">${body}</p>
                  <div style="font-size:34px;letter-spacing:10px;font-weight:600;color:${ACCENT};font-family:${MONO};">{{ .Token }}</div>
                </div>`,
  });
}

const IGNORE = "Non hai chiesto tu questa email? Puoi ignorarla, non succede nulla.";

/**
 * I sei modelli. `key` e' il nome che usa la Management API
 * (mailer_subjects_&lt;key&gt; / mailer_templates_&lt;key&gt;_content).
 */
const TEMPLATES = [
  {
    key: "confirmation",
    file: "confirmation.html",
    subject: "Conferma la tua email per entrare in Zapp",
    html: linkTemplate({
      preheader: "Un tocco e il tuo account Zapp è pronto.",
      heading: "Benvenuto su Zapp",
      body: "Confermi che questa mail è la tua?",
      cta: "Conferma l'email",
      footer: IGNORE,
    }),
  },
  {
    key: "magic_link",
    file: "magic-link.html",
    subject: "Il tuo link di accesso a Zapp",
    html: linkTemplate({
      preheader: "Entra in Zapp senza password.",
      heading: "Entra in Zapp",
      body: "Questo link ti fa accedere subito, senza password. Vale una volta sola e scade a breve.",
      cta: "Entra in Zapp",
      footer: IGNORE,
    }),
  },
  {
    key: "recovery",
    file: "recovery.html",
    subject: "Reimposta la password di Zapp",
    html: linkTemplate({
      preheader: "Scegli una nuova password per Zapp.",
      heading: "Nuova password",
      body: "Hai chiesto di reimpostare la password del tuo account Zapp. Il link vale una volta sola e scade a breve.",
      cta: "Scegli una nuova password",
      footer:
        "Se non hai chiesto tu il cambio, ignora questa email: la password resta quella di prima.",
    }),
  },
  {
    key: "invite",
    file: "invite.html",
    subject: "Ti hanno invitato su Zapp",
    html: linkTemplate({
      preheader: "Un invito ad entrare in Zapp.",
      heading: "Ti hanno invitato su Zapp",
      body: "Zapp tiene il conto dei film e delle serie che guardi e ti dice su quale piattaforma trovarli in Italia. Accetta l'invito per creare il tuo account.",
      cta: "Accetta l'invito",
      footer: IGNORE,
    }),
  },
  {
    key: "email_change",
    file: "email-change.html",
    subject: "Conferma la tua nuova email su Zapp",
    html: linkTemplate({
      preheader: "Confermi il cambio di email su Zapp?",
      heading: "Confermi la nuova email?",
      body: "Stai spostando il tuo account Zapp da {{ .Email }} a {{ .NewEmail }}. Conferma per rendere valido il cambio.",
      cta: "Conferma il cambio",
      footer:
        "Se non hai chiesto tu il cambio, ignora questa email: l'indirizzo resta quello di prima.",
    }),
  },
  {
    key: "reauthentication",
    file: "reauthentication.html",
    subject: "Il tuo codice di verifica Zapp",
    html: codeTemplate({
      preheader: "Il codice per confermare che sei tu.",
      heading: "Confermi che sei tu?",
      body: "Inserisci questo codice in Zapp per completare l'operazione.",
      footer: "Non hai chiesto tu questo codice? Ignora questa email.",
    }),
  },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const t of TEMPLATES) {
  writeFileSync(join(OUT_DIR, t.file), t.html, "utf8");
  console.log(`scritto docs/auth/email-templates/${t.file}  — oggetto: ${t.subject}`);
}

if (!process.argv.includes("--push")) {
  console.log("\nSolo file. Aggiungi --push (con SUPABASE_ACCESS_TOKEN) per caricarli.");
  process.exit(0);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(
    "Manca SUPABASE_ACCESS_TOKEN (Personal Access Token: https://supabase.com/dashboard/account/tokens).",
  );
  process.exit(1);
}

const ref =
  process.env.SUPABASE_PROJECT_REF ??
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").match(
    /https:\/\/([a-z0-9]+)\.supabase\./,
  )?.[1];
if (!ref) {
  console.error("Ref del progetto non trovato: passa SUPABASE_PROJECT_REF.");
  process.exit(1);
}

const payload = {};
for (const t of TEMPLATES) {
  payload[`mailer_subjects_${t.key}`] = t.subject;
  payload[`mailer_templates_${t.key}_content`] = t.html;
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
if (!res.ok) {
  console.error(`Management API ${res.status}: ${(await res.text()).slice(0, 400)}`);
  process.exit(1);
}
console.log(`\nCaricati ${TEMPLATES.length} modelli sul progetto ${ref}.`);

# Il marchio Zapp nell'autenticazione

Due posti mostrano il nome del progetto invece di **Zapp**: la schermata di Google
("Scegli un account per continuare su …") e le email che Supabase manda agli utenti.
Nessuno dei due si cambia dal codice: sono impostazioni della Google Cloud Console e
del progetto Supabase. Qui c'è cosa cambiare e dove.

Progetto Supabase: `bbuhwzdbzxgydewmcdwd` · app: <https://zapp-mu.vercel.app>

## 1. Google: "per continuare su Zapp", con l'icona

Quello che l'utente legge nella schermata di scelta account viene **tutto dalla Google
Cloud Console**, non da Supabase e non dall'app.

1. Apri Supabase → **Authentication → Sign In / Providers → Google** e copia il
   **Client ID**: il progetto Google giusto è quello a cui appartiene.
2. Vai su <https://console.cloud.google.com/auth/branding> (voce **Branding**, nella
   vecchia interfaccia "Schermata consenso OAuth") con quel progetto selezionato.
3. Compila:
   - **Nome dell'app**: `Zapp` — è la stringa che sostituisce il codice del progetto.
   - **Email di assistenza utenti**: la tua.
   - **Logo dell'app**: PNG quadrato, ≤ 1 MB → usa `public/icons/icon-512.png`
     (già nel repo, tile scuro con la Z).
   - **Home page dell'app**: `https://zapp-mu.vercel.app`
   - **Privacy policy** e **Termini di servizio**: servono per pubblicare l'app; finché
     non ci sono, l'app resta "in test" e possono entrare solo gli utenti di prova.
   - **Domini autorizzati**: `vercel.app` (e il dominio proprio, quando ci sarà).
4. Salva.

Due avvertenze, perché il risultato non è immediato al 100%:

- **Il nome cambia subito**; il **logo** compare solo dopo la verifica del marchio da
  parte di Google (si chiede dalla stessa pagina, richiede giorni e un dominio di cui
  dimostrare la proprietà). Senza verifica resta la lettera iniziale/nessuna icona.
- Sotto al nome Google scrive anche il **dominio a cui si viene rimandati**, che oggi è
  `bbuhwzdbzxgydewmcdwd.supabase.co` perché il callback OAuth è là. Quella riga sparisce
  solo con un **dominio proprio per l'auth**: Supabase → Settings → **Custom Domain**
  (add-on a pagamento) su, per esempio, `auth.zapp.app`; poi va aggiornato l'URI di
  reindirizzo autorizzato nel client OAuth di Google e il Site URL in Supabase.

## 2. Email: modelli con l'aspetto di Zapp

I sei modelli (conferma iscrizione, magic link, recupero password, invito, cambio email,
codice di riautenticazione) li genera `scripts/auth-emails.mjs` e stanno in
`docs/auth/email-templates/`: fondo nero, accento `#c5baf4`, marchio Zapp, testo italiano.

La testata è il **muro di locandine che scorre**, come su login e registrazione. Nelle
email non esistono né animazioni CSS né JavaScript, quindi è una GIF:
`scripts/email-wall.mjs` rende in Chrome la stessa geometria di `PosterWall` fotogramma
per fotogramma e la impacchetta con ffmpeg (serve ffmpeg nel PATH).

```bash
node --env-file=.env.local scripts/email-wall.mjs   # rifà public/email/wall.gif
```

Va rilanciato solo per cambiare le locandine: il file è versionato e l'email non chiama
TMDB. Chi le GIF non le anima (Outlook classico) vede il primo fotogramma, che è
comunque il muro. Sotto la testata **non c'è nessuna card**: testo e bottone stanno sul
fondo, come nel foglio di login.

Le immagini stanno in `public/email/`, la sola cartella servita con
`Cross-Origin-Resource-Policy: cross-origin` (`next.config.ts`). Tutto il resto dell'app
è `same-origin`, e un client di posta che rende in WebKit (Apple Mail) scarta l'immagine
con `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` — Gmail no, perché passa dal suo proxy.

```bash
node scripts/auth-emails.mjs          # riscrive i file HTML
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/auth-emails.mjs --push   # li carica
```

Il token è un **Personal Access Token** da
<https://supabase.com/dashboard/account/tokens> (non la service role key). In
alternativa si incollano a mano in **Authentication → Emails → Templates**, un file per
scheda, insieme all'oggetto stampato dallo script.

Le variabili sono quelle di Supabase (`{{ .ConfirmationURL }}`, `{{ .Token }}`,
`{{ .Email }}`, `{{ .NewEmail }}`): vanno lasciate così com'è.

### Il mittente "Zapp" richiede un SMTP proprio

Con il servizio SMTP incluso, Supabase manda le email da `noreply@mail.app.supabase.io`
con nome mittente fisso, poche email all'ora e — sui progetti nuovi — solo verso i
membri del team. Per avere _Zapp \<no-reply@tuo-dominio\>_ e per mandare email a utenti
veri serve un SMTP proprio: **Authentication → Emails → SMTP Settings**, con un servizio
come Resend, Brevo o Postmark, dominio verificato (SPF + DKIM) e:

- **Sender name**: `Zapp`
- **Sender email**: `no-reply@<dominio>`

Finché il mittente resta quello di Supabase, i modelli qui sopra si vedono comunque:
cambia solo il nome nella riga "Da:".

### Mentre ci sei

**Authentication → URL Configuration**: `Site URL` = `https://zapp-mu.vercel.app` e fra
i _Redirect URLs_ `https://zapp-mu.vercel.app/auth/callback` (più
`http://localhost:3000/auth/callback` per lo sviluppo). È l'URL che finisce dentro
`{{ .ConfirmationURL }}`.

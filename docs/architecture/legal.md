# Conformità legale

Consensi, documenti pubblici, cancellazione dell'account, export dei dati e gli obblighi
del DSA. I documenti interni (registro dei trattamenti, DPIA, data breach, moderazione,
fornitori) stanno in `docs/legal/`; qui c'è solo il funzionamento del codice.

## Il consenso è versionato, non un booleano

`user_consents` (migration `0043`) ha chiave primaria `(user_id, kind, version)`. Le
versioni correnti stanno in `src/lib/legal/versions.ts`:

```ts
export const VERSIONI = {
  terms: "2026-09-12",
  privacy: "2026-09-12",
  personalization: "1",
  scrobble: "1",
};
```

**Perché non un booleano `ha_accettato`.** L'art. 7(1) GDPR chiede al titolare di
*dimostrare* il consenso, e la domanda vera non è "ha accettato?" ma "a cosa aveva
acconsentito questa persona il giorno X". Un booleano non la regge: cambia il testo e la
risposta di ieri diventa falsa senza che nessuno se ne accorga. Con la versione nella
chiave, alzare `VERSIONI.privacy` **rimette in coda quel consenso per tutti** — il gate
del layout `(app)` torna a chiederlo — e l'accettazione vecchia resta nello storico.

La revoca **scrive una data** in `revoked_at`, non cancella la riga. `terms` e `privacy`
non sono revocabili dall'interfaccia: revocarli significa smettere di usare Zapp, e la
strada è la cancellazione dell'account.

### La trappola dell'upsert

Il grant di UPDATE su `user_consents` copre solo `(granted_at, revoked_at)`. Un upsert di
PostgREST genera un `on conflict do update` su **tutte** le colonne del payload, quindi
riscriverebbe anche `user_id`/`kind`/`version` e risponderebbe "permission denied for
column" a ogni riconcessione. `scriviConsenso` fa update-poi-insert, e sul `23505` di una
corsa rifà l'update.

## Dove si chiedono

| Punto | Cosa chiede |
| --- | --- |
| Passo 0 dell'onboarding (`OnboardingForm.tsx`) | `terms` + `privacy`, prima di ogni altro campo |
| `ConsentGate` nel layout `(app)` | Gli stessi due, a chi era iscritto prima o dopo un cambio di versione |
| Sezione "Privacy e dati" del profilo | I due facoltativi: `personalization`, `scrobble` |

La casella vive in **un solo componente** (`ConsentCheckbox`) perché il testo accettato
dev'essere identico nei due punti: due copie divergono alla prima correzione. Non è mai
pre-spuntata (CGUE C-673/17, Planet49).

Il gate non costa un round trip: `getConsensi()` entra nel `Promise.all` che il layout
`(app)` già fa, e riusa `getViewer()` tramite React `cache`.

`personalization_enabled` in `user_preferences` resta come colonna che il job
`taste-refresh` legge, ma **la fonte di verità è `user_consents`**: `allineaInterruttore`
la tiene allineata dalla action, e l'interruttore duplicato che c'era nel profilo è stato
tolto — due comandi per la stessa cosa, e uno dei due non scriveva il consenso.

## Le pagine pubbliche

`/privacy`, `/termini`, `/licenze` e `/addio` stanno nel route group `(legal)`, fuori dal
guscio `(app)`, e sono in `PUBLIC_PATHS` del middleware. **Non leggono mai il database**:
il ruolo `anon` non ha grant su niente e una query lì fallirebbe in silenzio. Sono testo
statico, quindi restano prerenderizzate.

Un'informativa raggiungibile solo da loggati non informa nessuno: chi sta decidendo se
registrarsi è esattamente la persona che deve poterla leggere.

## Età minima

`ETA_MINIMA = 14` sta in `src/lib/legal/versions.ts`, non nella Server Action
dell'onboarding: un file `"use server"` può esportare **solo funzioni asincrone**, e una
costante lì dentro fa fallire il build.

Il controllo sta **prima** dell'update di `profiles`: scriverlo dopo lascerebbe dentro un
minore con l'onboarding già completato. 14 e non 16 perché l'Italia ha esercitato la
deroga dell'art. 8(1) GDPR con l'art. 2-quinquies del Codice Privacy.

## Export (art. 20)

`GET /api/account/export` — route handler e non Server Action, perché deve restituire un
file e una Server Action non sa impostare `Content-Disposition`. Client a cookie, quindi
RLS attiva: per costruzione esce solo ciò che l'utente ha diritto di vedere di sé. Un
export all'ora, con limite condiviso.

Tre cose da sapere prima di toccarlo:

1. **La colonna utente non è `user_id` ovunque.** `title_lists` usa `owner_id`,
   `title_list_items` usa `added_by`, `reports` usa `reporter_id`, `profiles` usa `id`.
   Chiedere `user_id` a una di queste non dà zero righe: dà un 400 che finisce nel catch
   e svuota la voce in silenzio.
2. **Due tabelle hanno due colonne utente** (`friendships`, `recommendations`,
   `recommendation_links`): una `.eq()` sola non le copre, servono `.or()`. Lì
   l'interpolazione dell'id è sicura perché viene dalla sessione verificata, mai dal
   client.
3. **`devices` non ha una colonna utente**: il legame passa da `device_members`.

> **Regola permanente:** chi aggiunge una tabella con dati personali la aggiunge
> all'inventario di `route.ts` **e** a quello di `scripts/legal-check.mjs`. Altrimenti il
> diritto di portabilità si buca in silenzio, e nessun test se ne accorge.

I biglietti del cinema sono file da megabyte: l'export li **elenca**, non li incorpora.

## Cancellazione (art. 17)

`deleteAccount` in `src/lib/account/actions.ts`. Si conferma digitando il proprio nome
utente: un "sei sicuro?" si clicca per riflesso, questo no.

La cascata delle chiavi esterne era **già completa** (`auth.users` → `profiles` con
`on delete cascade`, e da lì il resto dello schema), quindi `deleteUser` svuota da solo
tutto Postgres. Restano fuori tre cose, che la action fa a mano:

1. i file nel bucket `tickets` — lo storage non ha cascate;
2. i dispositivi di cui l'utente era l'unico membro — `devices.id` non ha una FK verso
   l'utente, e cancellando `device_members` resterebbero orfani per sempre;
3. le loro sessioni e gli scrobble in attesa.

**Deroga consapevole** alla regola "service client mai sui dati utente": `deleteUser` è
l'unica API che cancella la riga `auth.users`, e senza quella l'account resterebbe in
piedi. È accettabile perché l'id viene dalla sessione verificata, non è mai un parametro
del client, tocca solo quell'utente, ed è l'ultima istruzione dopo tutti i controlli.

Dopo il `signOut` si atterra su `/addio`, che è pubblica: senza, si finirebbe su `/login`
senza sapere se l'eliminazione è riuscita.

## DSA: la rimozione si comunica

Migration `0044`. Tre segnalazioni distinte nascondono un contenuto; da quel momento
partono due notifiche (`notifications.kind`): `content_hidden` all'autore e
`report_outcome` a chi ha segnalato. Prima non arrivava niente a nessuno: il contenuto
spariva e basta.

Il trigger `notify_content_hidden` è **uno solo** e sta su **tre** tabelle — `reviews`,
`title_comments`, `daily_answers` — perché `report_count` esiste su tutte e tre: avvisare
per le recensioni e tacere sui commenti sarebbe l'obbligo dell'art. 16 fatto a metà. Il
tipo di bersaglio arriva da `tg_argv[0]` e usa gli stessi valori di `reports.target_type`.

La guardia `if new.report_count < 3 or coalesce(old.report_count, 0) >= 3` serve perché le
funzioni di sincronizzazione riscrivono la colonna a **ogni** segnalazione, anche quando
il valore non cambia: senza, dalla quarta in poi l'autore riceverebbe una notifica per
ciascuna.

Le due notifiche non hanno mittente: nell'elenco compaiono come "Zapp", con l'avatar
vuoto, perché dietro non c'è una persona.

## Come si collauda

```bash
NEXT_DIST_DIR=.next-legal pnpm build
NEXT_DIST_DIR=.next-legal pnpm exec next start -p 3399
BASE=http://localhost:3399 node --env-file=.env.local scripts/legal-check.mjs
node scripts/security-check.mjs   # il middleware è cambiato: le rotte nuove
                                  # devono risultare pubbliche di proposito
```

`legal-check.mjs` crea un utente finto, passa dal form vero e lo cancella dall'interfaccia:
verifica i tre documenti da sloggati, il passo 0, l'età minima, l'export (200 e poi 429) e
che dopo la cancellazione non resti una riga in nessuna delle tabelle dell'inventario.

## Cosa resta aperto

- I DPA di Supabase, Vercel e Upstash vanno accettati a mano e le date annotate in
  `docs/legal/fornitori.md`.
- Il consenso `scrobble` va chiesto nella schermata di collegamento di ZConnection
  (sottoprogetto 2): oggi si concede solo dal profilo.

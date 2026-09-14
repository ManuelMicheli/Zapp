# Checklist operativa — pubblicazione sugli store

Sequenza a mano per l'utente, non automatizzabile da qui: iscrizioni, pagamenti e
revisione umana. Ogni comando EAS va lanciato da `D:\PROGETTI\ZappMobile` (repo
del guscio, non questo). Fonti dei fatti tecnici: `docs/architecture/mobile.md`
("Stato EAS", "Credenziali push (a mano dell'utente)", "Deep link"); il resto
(costi, tempi di revisione, soglie di closed testing) sono prassi pubblica delle
due botteghe, non fatti di questo codice — segnati come tali.

## 0. Prerequisiti comuni

- [ ] `docs/project/store/listing-it.md` e `docs/project/store/data-safety.md`
      pronti (fatto in questo task).
- [ ] Screenshot in `docs/project/store/screenshots/{ios,android}/` (fatto in
      questo task).
- [ ] Icona 1024×1024 e le altre risoluzioni dell'app — a carico del task 5.2
      (`docs/RILASCIO.md` nel repo `ZappMobile`).

## 1. Apple

1. **Iscrizione ad Apple Developer Program** (99 $/anno) — oggi non attiva
   (`docs/architecture/mobile.md` "Contesto": "iOS mai compilato perché l'Apple
   ID non è iscritto al programma"). Aspetta l'approvazione (può richiedere
   alcuni giorni).
2. **App Store Connect → nuova app**: bundle id `com.zapp.mobile`, nome "Zapp",
   lingua principale italiano.
3. **Team ID**: App Store Connect → Membership. Sostituirlo al posto di
   `TEAMID` in `public/.well-known/apple-app-site-association` (repo Zapp, il
   file **non esiste ancora** nel repo — va creato, vedi
   `docs/architecture/mobile.md` "Deep link" per il contenuto esatto) e
   pubblicarlo **prima della prima build TestFlight**: un file mancante o con
   `TEAMID` letterale fa fallire Universal Link/Handoff in silenzio.
4. **App Group** `group.com.zapp.mobile` nel portale Apple, prima della prima
   build — senza, l'estensione di condivisione (Share Extension) accetta il
   link ma l'app non riceve nulla (`docs/architecture/mobile.md` "Condividi in
   Zapp").
5. **Chiave API App Store Connect** (Users and Access → Integrations → App
   Store Connect API), per far parlare `eas submit` senza login interattivo a
   ogni volta.
6. Build e submit, da `D:\PROGETTI\ZappMobile`:

   ```bash
   npx eas-cli login
   npx eas-cli init
   npx eas-cli credentials --platform ios   # chiave APNs (.p8) per il push
   eas build --profile production --platform ios
   eas submit --platform ios
   ```

   Il primo `eas build --platform ios` è anche il **primo compilatore** mai
   passato sullo Swift degli App Intents (Siri) — è lì che si scoprono errori
   di sintassi, non prima (`docs/architecture/mobile.md` "Swift compilato solo
   da EAS").

7. **TestFlight interno** (fino a 100 tester, nessuna revisione Apple):
   verificare i 6 controlli di `docs/architecture/mobile.md` ("I 6 controlli
   sul dispositivo") su un iPhone vero.
8. **TestFlight esterno** (richiede revisione Apple, fino a 10.000 tester):
   aggiungere i tester, inviare a revisione.
9. **Sottomissione alla revisione app** (non solo TestFlight): compilare le
   note del revisore con il contenuto di `listing-it.md` §"Note per il
   revisore Apple" (account di test incluso), classificazione età (12+, vedi
   `listing-it.md` §"Classificazione contenuti"), URL privacy e termini.

## 2. Google

1. **Play Console**: iscrizione una tantum, **25 €** (prassi pubblica di
   Google, non un fatto di questo codice).
2. **Nuova app**: pacchetto `com.zapp.mobile` (deve combaciare con
   `android.package` del guscio), nome "Zapp", categoria Intrattenimento.
3. **Data Safety**: compilare il questionario in Play Console con le risposte
   di `docs/project/store/data-safety.md` §"Google Play — Data Safety" — si
   ricopia a mano, il questionario non si importa da file.
4. **Service account JSON** (Play Console → Impostazioni → Accesso API → crea
   service account, poi concedigli il ruolo "Release manager" sull'app) per
   `eas submit --platform android` non interattivo.
5. Fingerprint per gli app link, da `D:\PROGETTI\ZappMobile`:

   ```bash
   npx eas-cli credentials --platform android   # → fingerprint SHA-256
   ```

   Il fingerprint va al posto di `SHA256_DA_EAS_CREDENTIALS` in
   `public/.well-known/assetlinks.json` (repo Zapp, il file **esiste già** col
   segnaposto) — senza, Android non verifica l'app link e apre il browser
   invece dell'app (`docs/architecture/mobile.md` "Universal/app link").

6. **Credenziali FCM V1** (Google Service Account per il push), stesso comando
   di sopra, scegliendo "Push Notifications: Manage your FCM Api Key":

   ```bash
   npx eas-cli credentials --platform android
   ```

7. Build e submit:

   ```bash
   eas build --profile production --platform android
   eas submit --platform android
   ```

8. **Closed testing**: almeno **12 tester per 14 giorni consecutivi** prima
   che Google sblocchi la produzione per un account sviluppatore nuovo (prassi
   pubblica di Google Play dal 2023, non un fatto di questo codice —
   verificare il numero e i giorni esatti in Play Console al momento della
   pubblicazione, potrebbero cambiare).
9. **Promozione a produzione**, dopo il periodo di test.

## 3. Notifiche push (entrambe le piattaforme)

Da `D:\PROGETTI\ZappMobile`, nell'ordine (`docs/architecture/mobile.md`
"Credenziali push (a mano dell'utente)"):

```bash
npx eas-cli init                              # scrive extra.eas.projectId
npx eas-cli credentials --platform ios        # chiave APNs (.p8)
npx eas-cli credentials --platform android    # credenziali FCM V1
```

Senza `extra.eas.projectId`, `ottieniTokenPush()` lato guscio torna `null` senza
errore: niente token, e niente che lo dica — verificare che il campo sia
valorizzato in `app.config.ts` dopo `eas init`.

`EXPO_ACCESS_TOKEN` (variabile Vercel, già in `.env.example`) resta facoltativa:
serve solo se sul progetto Expo si attiva la "enhanced push security".

## 4. Deep link — riepilogo dei due file

| File                                            | Piattaforma | Stato oggi                                | Cosa manca                                                                       |
| ----------------------------------------------- | ----------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `public/.well-known/assetlinks.json`            | Android     | Nel repo, con `SHA256_DA_EAS_CREDENTIALS` | Fingerprint vero da `eas credentials --platform android` (punto Google §5)       |
| `public/.well-known/apple-app-site-association` | iOS         | **Non nel repo**                          | Crearlo con il Team ID vero (punto Apple §3), prima della prima build TestFlight |

## 5. Dopo la pubblicazione

- [ ] `expo-updates`: canali e policy di `runtimeVersion` sono compito del task
      5.2 (`ZappMobile`, `docs/RILASCIO.md`) — verificare che esistano prima di
      spingere il primo OTA update.
- [ ] Rifare gli screenshot (`scripts/store-screenshots.mjs`) se l'interfaccia
      cambia in modo visibile prima di un aggiornamento della scheda.
- [ ] Prima del submit: rigenerare gli screenshot alle dimensioni pixel esatte
      richieste dalle botteghe (1290×2796 iOS, 1080×1920 Android — quelli
      committati in `screenshots/` sono compressi a dsf 2, non le dimensioni
      esatte):

  ```bash
  BASE=http://localhost:3408 node --env-file=.env.local scripts/store-screenshots.mjs --esatto
  ```

  Scrive in `docs/project/store/screenshots-esatti/{ios,android}/`, fuori dal
  repo (in `.gitignore`): caricarli a mano in App Store Connect / Play Console
  da lì, non committarli.

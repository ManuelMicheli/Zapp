# Zapp Mobile — Fase 5: pubblicazione sugli store. Piano di esecuzione

> **Per gli agenti esecutori:** SUB-SKILL RICHIESTA: superpowers:subagent-driven-development.
**Spec:** docs/superpowers/specs/2026-09-12-zapp-mobile-design.md (§1.9, §2). Piano generale: docs/superpowers/plans/2026-09-12-zapp-mobile-fase-0.md §3, §5.

**Obiettivo:** tutto cio' che si puo' preparare **senza** gli account attivi (Apple Developer in attesa di iscrizione, Google Play da aprire): scheda dello store, questionari privacy, screenshot, checklist operativa; e nel guscio versione 1.0.0, EAS Update, profili di submit, manifesto privacy.

**Contesto (2026-09-13):** fasi 0-4 in produzione lato server; guscio a `v0.5`; primo APK Android provato; iOS mai compilato (Swift) perche' l'Apple ID non e' iscritto al programma. Gli screenshot si fanno con Playwright sul sito (l'app e' il sito in WebView): sono fedeli.

## Task (5.1 e 5.2 in parallelo, repo diversi; 5.3 in coda)

### 5.1 (Sonnet, Zapp) — `docs/project/store/`: `listing-it.md`, `data-safety.md`, `screenshots/{ios,android}/*.png` (script `scripts/store-screenshots.mjs`), `checklist.md`
### 5.2 (Sonnet, ZappMobile) — `version 1.0.0`, `runtimeVersion` policy, `expo-updates` + canali, `eas.json` submit, icona 1024, `ios.privacyManifests`, `docs/RILASCIO.md`
### 5.3 (Sonnet, Zapp) — `docs/architecture/mobile.md` sezione "Store" + `legal.md` una riga sul push (consenso: il permesso di sistema; la domanda del giorno e' engagement) + gate

## Verifica di fase
1. Zapp: `pnpm typecheck && pnpm lint && pnpm test`; gli screenshot aperti a occhio; nessuna rotta cambia (rilascio via `rilascio.mjs` porta solo docs + script).
2. Mobile: `typecheck`, `expo-doctor`, `expo config` mostra versione/updates/runtimeVersion.
3. Il resto (submit, review, closed testing) e' nelle mani dell'utente: `docs/project/store/checklist.md` e `docs/RILASCIO.md` sono il consegnabile.

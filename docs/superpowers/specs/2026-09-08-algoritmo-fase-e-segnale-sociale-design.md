# Algoritmo Zapp — Fase E: il segnale sociale dentro i consigli

Data: 2026-09-08. Stato: progettata dopo A, B, C e D, tutte in produzione.

## Il quadro

| | Sottosistema | Stato |
|---|---|---|
| A | Segnali utente (`user_taste`) | **fatta** (2026-09-07) |
| B | Catalogo & ZappScore | **fatta** (2026-09-07) |
| C | Motore di ranking (affinità + motivo) | **fatta** (2026-09-07) |
| D | Home dinamica (categorie, ordine, rail personali) | **fatta** (2026-09-08) |
| **E** | **Loop sociale: gli amici entrano nel ranking** | **questa spec** |

## Che cosa manca davvero

Zapp ha già tutto il **prodotto** sociale, dalla fase 4: amicizie, recensioni, consigli
fra amici, notifiche, feed, la sezione "I tuoi amici" in home con "Stanno guardando".
Rifarlo non serve a niente.

Quello che manca è che **niente di tutto ciò entra nei consigli**. Il motore della fase C
sa cosa piace all'utente e quanto vale un titolo, ma non sa che *tre dei suoi amici lo
hanno appena finito* — che nella vita vera è il motivo più forte per cui si guarda
qualcosa.

## Obiettivo

1. **Un titolo che gli amici hanno visto sale**, e di quanto lo dice un numero, non un
   sentimento.
2. **Il motivo lo dice**: "Visto da Marco e altri 2" sotto la copertina, insieme a
   "per te 84%".
3. **Gli amici portano candidati**: i titoli che hanno finito e votato bene entrano nel
   pool anche se non stanno in nessuna classifica e in nessun `discover`. È l'unica
   fonte di candidati che sa qualcosa che TMDB non sa.

**Fuori scope**: inviti, notifiche e feed (esistono e funzionano), e qualunque cosa
esponga a un utente cosa un amico ha segnato come privato.

## 1. La privacy la fa il database, non una `where`

`watch_entries` ha già la policy `watch_entries_select_friends`:

```sql
are_friends(auth.uid(), user_id) AND (NOT is_private)
```

Quindi **una query normale sulle entry altrui, fatta con il client a cookie, restituisce
esattamente ciò che l'utente ha diritto di vedere**: gli amici, e solo le entry non
private. Non serve una `where` in più, e soprattutto non deve esserci un service client
da nessuna parte di questa fase — sarebbe l'unico modo di sbagliare.

## 2. Il segnale

`getSocialSignals(db, userId)` (`src/lib/rank/social.ts`, server): una query su
`watch_entries` con il client dell'utente, `status in ('watched','watching')`, ultimi 180
giorni, e i nomi dei profili. Torna una mappa `tipo-id → { amici, votoMedio, nomi }`.

`nomi` sono al massimo tre, e servono solo al motivo.

## 3. Il peso

`RankCandidate.friends` (opzionale) entra nell'affinità come **moltiplicatore**, non come
ottava dimensione del gusto: gli amici non sono un gusto, sono una spinta.

```
bonus = 1 + min(BONUS_MAX, BONUS_PER_AMICO × amici)   // 0,08 per amico, tetto 0,25
```

Un amico solo dà +8%, tre danno +24%, dieci danno sempre +25%: oltre, è già "lo guardano
tutti", non "lo guardano i tuoi amici". Se il voto medio degli amici è basso (≤ 4) il
bonus **non si applica affatto**: che tre amici l'abbiano visto e non gli sia piaciuto
non è una raccomandazione.

Il bonus si applica **dopo** gusto e qualità e il punteggio resta limitato a 1, così una
percentuale non può superare il 100%.

## 4. Il motivo

Il contributo sociale, quando c'è, **batte tutti gli altri**: "Visto da Marco" dice più
di "Perché guardi molto dramma", ed è vero in un modo che l'utente può verificare.

- un amico: `Visto da Marco`
- due: `Visto da Marco e Giulia`
- tre o più: `Visto da Marco e altri 2`

I nomi sono `display_name` o `username`: quelli che l'utente vede ovunque nell'app.

## 5. I candidati

`getCandidates` aggiunge una fonte: i titoli che gli amici hanno **finito con voto ≥ 7**
negli ultimi 180 giorni, con i metadati letti da `titles` (le colonne esplicite, mai
`raw`). Restano soggetti a tutti i filtri già in vigore — libreria, nome leggibile,
generi esclusi — ma **non alla soglia dei voti TMDB**: se un amico l'ha visto e gli è
piaciuto, quanti voti abbia su TMDB non conta più.

## 6. Verifica

**Puro (Vitest)**: il bonus per uno, tre e dieci amici; il tetto; il voto medio basso che
lo annulla; il punteggio che non supera 1; le tre forme del motivo; il motivo sociale che
vince sugli altri.

**Con i dati veri**: `scripts/rank-dump.ts` su un utente con amici deve mostrare "Visto
da …" su qualche riga; e la stessa lista, per un utente senza amici, non deve cambiare di
una virgola rispetto a prima.

## 7. Rischi noti

- **Il nome di un amico sotto una copertina è un dato personale mostrato a un altro
  utente.** È lo stesso che la home già fa in "Stanno guardando", con le stesse policy a
  proteggerlo — ma è la ragione per cui questa fase non può usare il service client da
  nessuna parte, e per cui la query non filtra a mano nulla che la policy possa filtrare
  da sé.
- **Con pochi amici il segnale è rumoroso**: due amici su tre che hanno visto un titolo
  lo spingono quanto un ottimo ZappScore. Il tetto al 25% serve a questo.

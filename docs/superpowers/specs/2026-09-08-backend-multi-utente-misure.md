# Misure di scala

Banco: `public.bench_scale(500, 1000)` — 500 utenti finti, 500.000 righe in
`watch_entries`, 50.000 attivita', 20.000 notifiche, 4.000 amicizie. Il banco
inserisce, misura con `explain (analyze, buffers)` fingendosi uno degli utenti
finti, poi cancella tutto e lo verifica: dopo ogni corsa `auth.users` torna a 10
e `watch_entries` a 5.333.

Sul database vero i numeri di partenza (2026-09-08) sono 10 utenti e 5.333 righe
in `watch_entries`: a quel volume ogni query costa meno di un millisecondo, per
questo serve il banco.

## Risultati

| query | prima (ms) | dopo (ms) |
| --- | --- | --- |
| libreria (60 titoli "sto guardando", con la join sul titolo) | 132,88 | — |
| feed (40 attivita' recenti visibili) | 1302,61 | — |
| consigli ricevuti e non ancora visti | 7,03 | — |
| notifiche non lette | 0,71 | — |

## Piani, prima

- **libreria**: `Limit` → `Sort` → nessun indice utile in testa. 133 ms per
  sessanta righe: e' il costo della RLS valutata riga per riga sul mezzo milione
  di righe della tabella, piu' l'assenza dell'indice sulla chiave esterna verso
  `titles`.
- **feed**: `Limit` → `Sort` sulle 50.000 attivita'. 1,3 secondi. Due cause
  sovrapposte: nessun indice su `created_at`, quindi l'ordinamento parte da una
  scansione completa; e due policy permissive che, per ogni riga esaminata,
  chiamano `are_friends()`. Gia' con 20 utenti finti questa query costava
  1.295 ms, cioe' **non e' il numero di utenti a farla pesare, e' la forma**.
- **consigli**: `Bitmap Heap Scan` su `recommendations` — nessun indice su
  `to_user`.
- **notifiche**: unica query gia' sana, ha il suo indice
  (`notifications_user_idx`) dal primo giorno.

## Nota operativa

Ogni corsa del banco lascia mezzo milione di tuple morte in `watch_entries`:
dopo una serie di misure conviene un `vacuum analyze public.watch_entries`,
altrimenti la corsa successiva parte da una tabella gonfia e i numeri non sono
confrontabili.

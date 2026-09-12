# Valutazione preliminare di impatto (art. 35 GDPR)

**Titolare:** Manuel Micheli
**Servizio:** Zapp
**Data della valutazione:** 2026-09-12
**Esito: la DPIA non è dovuta.** La motivazione è qui sotto, e non va omessa: una
conclusione negativa senza ragioni scritte vale quanto una valutazione mai fatta.

## 1. Perché la domanda si pone

Zapp tratta preferenze di intrattenimento e, con il consenso, comportamenti di
navigazione usati per profilare i consigli. La profilazione è uno dei criteri che
l'art. 35(3)(a) associa alla valutazione d'impatto: la domanda va posta, non scartata.

## 2. I tre criteri dell'art. 35(3)

**(a) Valutazione sistematica e globale di aspetti personali basata su trattamento
automatizzato, con effetti giuridici o similmente significativi.** No. Il profilo di
gusto ordina una lista di film. Non produce effetti giuridici, non nega e non concede
nulla, e l'utente vede lo stesso catalogo completo con o senza personalizzazione. La
funzione si spegne dal profilo e, spegnendola, i dati raccolti si cancellano.

**(b) Trattamento su larga scala di categorie particolari di dati (art. 9) o di dati
relativi a condanne penali.** No. Nessuna categoria particolare è raccolta. Le
preferenze di visione **possono** rivelare convinzioni o orientamenti se interpretate,
ma non sono raccolte a quel fine, non sono arricchite da fonti esterne e non sono
incrociate con altri profili.

**(c) Sorveglianza sistematica di zone accessibili al pubblico su larga scala.** No.
Nessuna osservazione di spazi pubblici. La posizione usata dalla sezione Cinema è
dichiarata dall'utente o concessa esplicitamente, serve a trovare le sale vicine e non
viene storicizzata.

## 3. I criteri del WP248 (linee guida EDPB)

Dei nove criteri se ne applicano due — valutazione o attribuzione di punteggio
(ZappScore e profilo di gusto) e uso innovativo di tecnologia (riconoscimento del titolo
in riproduzione tramite ZConnection). **Due criteri su nove, e nessuno dei tre
dell'art. 35(3), con una base di utenti a due cifre**: la soglia della "larga scala"
(considerando 91) non è avvicinata. La valutazione non è dovuta.

## 4. Misure già in atto, che pesano nel giudizio

- La personalizzazione è **spenta per impostazione predefinita** e richiede un consenso
  esplicito, registrato con la versione del testo accettato.
- Revocare il consenso cancella i dati comportamentali, non li rende solo inutilizzati.
- I dati di personalizzazione hanno un termine di 90 giorni.
- ZConnection legge il titolo e il minutaggio, mai il contenuto riprodotto.
- Ogni tabella ha RLS per riga; la chiave di servizio non raggiunge mai il client.
- Export e cancellazione sono nelle mani dell'utente, senza dover scrivere a nessuno.

## 5. Quando questa valutazione va rifatta

Uno solo di questi eventi la riapre:

1. **Oltre 1.000 utenti registrati.** È la soglia oltre la quale "larga scala" smette di
   essere una parola vuota per questo servizio.
2. **Una categoria di dati nuova**, in particolare se anche solo indirettamente
   riconducibile all'art. 9.
3. **Una piattaforma nuova in ZConnection**, o un riconoscimento che vada oltre titolo e
   minutaggio.
4. **Decisioni automatizzate con effetti sull'utente** (limiti, blocchi, prezzi diversi).

Chi tocca uno di questi punti aggiorna la data in testa e rifà il ragionamento.

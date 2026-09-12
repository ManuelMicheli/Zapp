# Procedura in caso di violazione dei dati (artt. 33-34 GDPR)

**Titolare:** Manuel Micheli — `<EMAIL_PRIVACY>`
**Ultimo aggiornamento:** 2026-09-12

Una violazione è **qualunque** perdita di riservatezza, integrità o disponibilità dei
dati personali: non solo l'accesso di un estraneo, ma anche una cancellazione
accidentale o un'indisponibilità prolungata.

## 1. Come ce ne si accorge

- Avviso del fornitore (Supabase, Vercel, Upstash) via email o dashboard di stato.
- Advisor di sicurezza di Supabase: tabella senza RLS, policy troppo larga, funzione
  `security definer` esposta. Da controllare dopo **ogni** migration.
- `node scripts/security-check.mjs`: rotte protette raggiungibili da sloggati.
- Segnalazione di un utente a `<EMAIL_PRIVACY>`.
- Anomalie nei log di Vercel: picchi di 401/403, export ripetuti, scritture inattese.

## 2. Le prime due ore

1. **Contenere.** Revocare le chiavi compromesse (service role, token dei fornitori),
   chiudere la falla — una policy RLS sbagliata si corregge con una migration, non con
   una patch al client.
2. **Congelare le prove.** Salvare i log prima che ruotino: Vercel li conserva a
   finestra, e ciò che non si copia subito non esiste più.
3. **Annotare l'orologio.** Il termine delle 72 ore decorre da quando si *viene a
   conoscenza* della violazione, non da quando è avvenuta. L'ora va scritta subito.

## 3. Valutazione del rischio

Per ogni violazione si stabilisce per iscritto:

- quali categorie di dati e quante persone sono coinvolte;
- se i dati erano leggibili in chiaro;
- quali conseguenze concrete può subire l'interessato (furto d'identità, esposizione di
  contenuti privati, perdita di dati);
- se il danno è già in corso o solo possibile.

**Improbabile che comporti un rischio** → niente notifica al Garante, ma la violazione va
comunque annotata nel registro (art. 33(5)). **Rischio** → notifica al Garante entro 72
ore. **Rischio elevato** → anche comunicazione agli interessati, senza ritardo.

## 4. Notifica al Garante (entro 72 ore)

Si usa il modulo del Garante per la protezione dei dati personali
(`garanteprivacy.it`), indicando:

- natura della violazione, categorie e numero approssimativo di interessati e di record;
- contatto del titolare: `<EMAIL_PRIVACY>`;
- conseguenze probabili;
- misure adottate o proposte, comprese quelle per attenuare gli effetti.

Se non tutte le informazioni sono disponibili entro le 72 ore, **si notifica lo stesso**
con quelle che ci sono e si integra dopo: il ritardo va motivato, l'assenza di notifica
no.

## 5. Comunicazione agli interessati (art. 34)

Dovuta quando il rischio è elevato. Si scrive in italiano semplice, per email
all'indirizzo dell'account, dicendo: cosa è successo, quali dati, cosa può succedere,
cosa abbiamo fatto, cosa conviene fare (per esempio cambiare la password se riusata
altrove), e a chi scrivere per domande.

Non è dovuta se i dati erano cifrati e inintelligibili, se il rischio è stato
neutralizzato subito, o se lo sforzo sarebbe sproporzionato — in quest'ultimo caso serve
una comunicazione pubblica equivalente.

## 6. Registro degli incidenti

**Ogni** violazione va annotata, anche quella che non si notifica: l'art. 33(5) lo
richiede e serve a dimostrare che la valutazione è stata fatta. Il registro sta in
`docs/legal/incidenti.md` (si crea al primo incidente) con una riga per evento:

| Data e ora della scoperta | Cosa è successo | Dati e persone coinvolte | Rischio valutato | Notificato al Garante? | Interessati avvisati? | Misure adottate |
|---|---|---|---|---|---|---|

Le righe non si cancellano mai.

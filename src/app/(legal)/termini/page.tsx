import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Condizioni d'uso · Zapp",
  description:
    "Le regole del servizio: cosa fa Zapp, cosa puoi pubblicare, come si segnala un contenuto.",
};

export default function TerminiPage() {
  return (
    <LegalPage titolo="Condizioni d'uso" aggiornato="12 settembre 2026">
      <section>
        <h2>1. Cos&apos;è Zapp</h2>
        <p>
          Zapp è un diario personale di film e serie TV. Serve a tenere traccia di ciò che
          hai visto, di ciò che stai guardando e di ciò che vuoi vedere, a sapere su quali
          piattaforme un titolo è disponibile in Italia e ad aprire la pagina ufficiale di
          quel titolo sulla piattaforma che scegli tu.
        </p>
        <p>
          <strong>Zapp non riproduce contenuti.</strong> Non ospita, non trasmette e non
          scarica film o serie, e non aggira in alcun modo le protezioni o gli abbonamenti
          delle piattaforme. Quando tocchi il pulsante di una piattaforma esci da Zapp: da
          lì in poi valgono le condizioni di quel servizio e il tuo abbonamento con lui.
          Zapp non è affiliata, sponsorizzata né approvata da nessuna delle piattaforme,
          dei cataloghi o dei circuiti cinematografici che cita.
        </p>
        <p>
          Il servizio è offerto da Manuel Micheli. Registrandoti e usando Zapp accetti
          queste condizioni; se non le accetti, non puoi usare il servizio.
        </p>
      </section>

      <section>
        <h2>2. Chi può iscriversi</h2>
        <ul>
          <li>
            Devi avere <strong>almeno 14 anni</strong>. È la soglia prevista in Italia per
            prestare da soli il consenso ai servizi della società dell&apos;informazione.
          </li>
          <li>
            <strong>Un account per persona.</strong> Gli account creati per moltiplicare
            voti, segnalazioni, richieste di amicizia o per aggirare una sospensione
            vengono chiusi.
          </li>
          <li>
            <strong>I dati che inserisci devono essere veri.</strong> L&apos;indirizzo
            email deve essere tuo e raggiungibile: è l&apos;unico modo che abbiamo di
            farti recuperare l&apos;accesso e di avvisarti quando qualcosa cambia.
          </li>
          <li>
            Le credenziali sono tue e le custodisci tu. Sei responsabile di ciò che viene
            fatto con il tuo account; se pensi che qualcun altro vi abbia accesso, scrivi
            a <code>&lt;EMAIL_PRIVACY&gt;</code>.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Cosa non si può pubblicare</h2>
        <p>
          Recensioni, commenti, liste, nome utente, immagine del profilo e risposte alla
          domanda del giorno sono contenuti tuoi: ne resti l&apos;autore e il
          responsabile. Non puoi pubblicare:
        </p>
        <ul>
          <li>
            contenuti <strong>illeciti</strong>, o che violano il diritto d&apos;autore, i
            marchi o altri diritti di terzi;
          </li>
          <li>
            collegamenti a copie non autorizzate di film e serie, o a servizi che le
            distribuiscono: Zapp indica dove un titolo si guarda legalmente, e non è il
            posto per farne circolare copie;
          </li>
          <li>
            insulti, molestie, minacce, incitamento all&apos;odio o alla violenza e
            contenuti <strong>discriminatori</strong> per origine, etnia, religione,
            disabilità, età, sesso, orientamento sessuale o identità di genere;
          </li>
          <li>
            materiale <strong>pornografico</strong> o sessualmente esplicito, e qualsiasi
            contenuto che coinvolga minori in modo sessualizzato;
          </li>
          <li>
            <strong>spam</strong>: pubblicità, catene, promozioni ripetute, testi generati
            in serie;
          </li>
          <li>
            <strong>dati personali di altre persone</strong> — indirizzi, numeri di
            telefono, fotografie private, conversazioni — senza il loro consenso;
          </li>
          <li>
            <strong>rivelazioni sulla trama</strong> senza spuntare la casella
            &laquo;Contiene spoiler&raquo;: Zapp le nasconde dietro un tocco a chi non ha
            ancora visto il titolo, ma solo se le marchi tu.
          </li>
        </ul>
        <p>
          Pubblicando un contenuto ci autorizzi a mostrarlo dentro Zapp alle persone che
          hanno il diritto di vederlo. Non lo rivendiamo, non lo cediamo a terzi e non lo
          usiamo fuori dal servizio; se lo cancelli, sparisce.
        </p>
      </section>

      <section>
        <h2>4. Moderazione e segnalazioni</h2>
        <p>
          Zapp ospita contenuti scritti dagli utenti e applica il meccanismo di
          segnalazione e azione previsto dall&apos;art. 16 del Regolamento (UE) 2022/2065
          (Digital Services Act).
        </p>
        <p>
          <strong>Come si segnala.</strong> Ogni recensione, commento e risposta alla
          domanda del giorno ha un pulsante di segnalazione: chiunque veda il contenuto
          può usarlo per indicare che lo ritiene illecito o contrario a queste condizioni,
          scegliendo il motivo. Se il pulsante non basta — per esempio perché il contenuto
          è un nome utente o un&apos;immagine del profilo, o perché serve spiegare una
          situazione — scrivi a <code>&lt;EMAIL_PRIVACY&gt;</code> indicando dove si trova
          il contenuto, che cosa contesti e un recapito a cui risponderti.
        </p>
        <p>
          <strong>Cosa succede dopo.</strong> Ogni segnalazione viene esaminata in modo
          tempestivo, diligente, non arbitrario e non discriminatorio, e la decisione la
          prende una persona. L&apos;esito può essere: nessun provvedimento, la rimozione
          del contenuto, la sospensione o la chiusura dell&apos;account di chi lo ha
          pubblicato. Un contenuto che raccoglie <strong>tre segnalazioni</strong> viene
          nascosto automaticamente in attesa dell&apos;esame: è una misura provvisoria e
          automatica, non una decisione, e viene sciolta in un senso o nell&apos;altro
          quando la segnalazione viene esaminata.
        </p>
        <p>
          <strong>Se un tuo contenuto viene rimosso.</strong> Ricevi una notifica in app
          che dice quale contenuto è stato colpito, qual è il provvedimento, per quale
          motivo e se è stato preso con strumenti automatici. Puoi contestarlo scrivendo a{" "}
          <code>&lt;EMAIL_PRIVACY&gt;</code> entro sei mesi dalla notifica: il reclamo
          viene riesaminato da una persona, ricevi una risposta motivata e, se il riesame
          ti dà ragione, il contenuto viene ripristinato.
        </p>
        <p>
          <strong>Se hai segnalato tu.</strong> Ti comunichiamo l&apos;esito
          dell&apos;esame, senza ritardi ingiustificati.
        </p>
        <p>
          <strong>Punto di contatto.</strong> Il punto di contatto unico per le autorità e
          per gli utenti è <code>&lt;EMAIL_PRIVACY&gt;</code>. Si può scrivere in italiano
          o in inglese.
        </p>
        <p>
          Restano impregiudicati i tuoi diritti di rivolgerti a un organismo di
          risoluzione extragiudiziale delle controversie o a un giudice.
        </p>
      </section>

      <section>
        <h2>5. Contenuti di terzi</h2>
        <p>
          Le schede dei titoli — locandine, fotogrammi, trame, cast, date, generi —
          vengono da TMDB. Gli orari delle sale vengono da MyMovies e dai servizi pubblici
          dei circuiti cinematografici. I trailer sono video ospitati da YouTube e
          incorporati tramite il suo player. Zapp non produce, non verifica e non
          controlla questi contenuti.
        </p>
        <p>
          I marchi, i loghi e i titoli citati appartengono ai rispettivi titolari e sono
          usati solo per identificare l&apos;opera o il servizio di cui si parla.
          L&apos;elenco completo delle fonti e delle licenze è nella pagina{" "}
          <strong>Licenze e attribuzioni</strong>.
        </p>
      </section>

      <section>
        <h2>6. Servizio gratuito, nessuna garanzia</h2>
        <p>
          Zapp è gratuito e viene offerto così com&apos;è e come disponibile. Non
          promettiamo che sia sempre raggiungibile, privo di errori o compatibile con ogni
          dispositivo, e possiamo cambiarne o sospenderne le funzioni.
        </p>
        <p>
          In particolare: <strong>gli orari dei cinema</strong>, i posti, i prezzi e{" "}
          <strong>la disponibilità di un titolo su una piattaforma</strong> sono
          informazioni di terzi, possono essere incomplete, vecchie o sbagliate e cambiano
          senza preavviso. Prima di comprare un biglietto, di metterti in viaggio o di
          contare su un abbonamento, verifica sul sito del cinema o della piattaforma.
        </p>
        <p>
          Nei limiti consentiti dalla legge il titolare non risponde dei danni derivanti
          dall&apos;uso o dal mancato funzionamento del servizio, né dell&apos;inesattezza
          delle informazioni di terzi. Restano fermi i diritti inderogabili riconosciuti
          ai consumatori e la responsabilità per dolo o colpa grave.
        </p>
      </section>

      <section>
        <h2>7. Chiusura dell&apos;account</h2>
        <p>
          Puoi chiudere il tuo account quando vuoi, dal profilo, alla voce{" "}
          <em>Elimina l&apos;account</em>. La cancellazione è definitiva e i dati vengono
          eliminati come descritto nell&apos;informativa privacy; prima di procedere puoi
          scaricare una copia di ciò che hai messo dentro.
        </p>
        <p>
          Il titolare può sospendere o chiudere un account che viola queste condizioni o
          la legge. Salvo i casi in cui la legge o un pericolo immediato impongano di
          agire subito, il provvedimento è accompagnato da un avviso che ne indica il
          motivo e lascia modo di replicare scrivendo a <code>&lt;EMAIL_PRIVACY&gt;</code>
          .
        </p>
        <p>
          Se il servizio dovesse chiudere, riceverai un avviso con un preavviso
          ragionevole e il tempo di scaricare i tuoi dati.
        </p>
      </section>

      <section>
        <h2>8. Modifiche</h2>
        <p>
          Queste condizioni e l&apos;informativa privacy possono cambiare. Quando cambia
          qualcosa di rilevante ne alziamo la versione: alla prima apertura successiva
          Zapp ti mostra il testo nuovo e ti chiede di accettarlo di nuovo, mentre
          l&apos;accettazione precedente resta registrata con la sua data. Finché non
          accetti, l&apos;app resta ferma su quella schermata; se non vuoi accettare puoi
          chiudere l&apos;account, anche scrivendo a <code>&lt;EMAIL_PRIVACY&gt;</code>.
        </p>
        <p>
          Le correzioni minime — refusi, chiarimenti che non toccano i tuoi diritti né i
          nostri obblighi — vengono pubblicate senza chiedere una nuova accettazione. La
          data in cima alla pagina dice sempre quando il testo è stato modificato
          l&apos;ultima volta.
        </p>
      </section>

      <section>
        <h2>9. Legge applicabile</h2>
        <p>
          A queste condizioni si applica la legge italiana. Se usi Zapp come consumatore
          restano ferme le disposizioni più favorevoli previste dalla legge del paese in
          cui risiedi, e per le controversie resta competente il giudice del luogo della
          tua residenza o del tuo domicilio.
        </p>
      </section>
    </LegalPage>
  );
}

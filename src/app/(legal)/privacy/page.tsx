import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Informativa privacy · Zapp",
  description: "Come Zapp tratta i dati personali di chi lo usa.",
};

export default function PrivacyPage() {
  return (
    <LegalPage titolo="Informativa privacy" aggiornato="12 settembre 2026">
      <section>
        <h2>1. Chi tratta i tuoi dati</h2>
        <p>
          Il titolare del trattamento è Manuel Micheli. Per qualsiasi richiesta relativa
          ai tuoi dati puoi scrivere a <code>&lt;EMAIL_PRIVACY&gt;</code>.
        </p>
      </section>

      <section>
        <h2>2. Quali dati raccogliamo e da dove</h2>
        <ul>
          <li>
            <strong>Account</strong>: indirizzo email, nome utente, nome visualizzato,
            avatar. Li fornisci tu registrandoti.
          </li>
          <li>
            <strong>Anno di nascita</strong>: lo chiediamo in fase di primo accesso e
            serve solo a calibrare i consigli sui decenni. Non compare mai sul tuo profilo
            pubblico.
          </li>
          <li>
            <strong>Libreria</strong>: i film e le serie che segni come da vedere, in
            corso, visti o abbandonati, con i voti e i progressi per episodio.
          </li>
          <li>
            <strong>Import Netflix</strong>: se carichi il file della tua cronologia
            Netflix, leggiamo titoli e date per riempire la libreria. Il file non viene
            conservato: restano solo le voci riconosciute.
          </li>
          <li>
            <strong>ZConnection</strong>: se colleghi l&apos;estensione per il browser e
            dai il consenso, riceviamo il titolo, la stagione, l&apos;episodio, la
            posizione nel video e la piattaforma di ciò che stai guardando. Non riceviamo
            immagini, audio, credenziali né il contenuto di altre schede.
          </li>
          <li>
            <strong>Contenuti sociali</strong>: amicizie, recensioni, commenti, consigli,
            liste, risposte alla domanda del giorno.
          </li>
          <li>
            <strong>Personalizzazione</strong>: se dai il consenso, registriamo quali
            copertine vedi e apri, per costruire un profilo di gusto.
          </li>
          <li>
            <strong>Cinema</strong>: la posizione che dichiari o concedi, i cinema
            preferiti, le serate salvate e i biglietti che carichi.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Perché li trattiamo e con quale base giuridica</h2>
        <ul>
          <li>
            Fornire il servizio (account, libreria, funzioni sociali):{" "}
            <em>esecuzione del contratto</em>, art. 6(1)(b) GDPR.
          </li>
          <li>
            Personalizzare i consigli: <em>consenso</em>, art. 6(1)(a). Puoi revocarlo in
            qualsiasi momento dal profilo; revocandolo cancelliamo i dati raccolti a
            questo scopo.
          </li>
          <li>
            Registrare automaticamente le visioni tramite ZConnection: <em>consenso</em>,
            art. 6(1)(a), richiesto separatamente quando colleghi un dispositivo.
          </li>
          <li>
            Sicurezza e prevenzione degli abusi (limiti di frequenza, moderazione):{" "}
            <em>legittimo interesse</em>, art. 6(1)(f).
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Chi altro vede i tuoi dati</h2>
        <p>
          Ci appoggiamo a fornitori che trattano i dati per nostro conto: Supabase
          (database, autenticazione e archiviazione dei file, server nell&apos;Unione
          Europea), Vercel (hosting e funzioni, esecuzione a Francoforte, società
          statunitense) e Upstash (limiti di frequenza).
        </p>
        <p>
          Altri servizi vengono interrogati dai nostri server senza ricevere nulla che ti
          riguardi: TMDB per il catalogo, Open-Meteo per il meteo, Nominatim e
          OpenStreetMap per la geocodifica, MyMovies e i circuiti cinematografici per gli
          orari. Due eccezioni, perché li contatta direttamente il tuo browser e quindi
          vedono il tuo indirizzo IP: <code>image.tmdb.org</code> per le locandine e{" "}
          <code>youtube-nocookie.com</code> per i trailer.
        </p>
        <p>
          Gli altri utenti vedono ciò che decidi tu: il profilo privato nasconde libreria,
          attività e statistiche.
        </p>
      </section>

      <section>
        <h2>5. Trasferimenti fuori dall&apos;Unione Europea</h2>
        <p>
          Vercel e Google sono società statunitensi. I trasferimenti avvengono sulla base
          delle clausole contrattuali tipo della Commissione europea e, dove applicabile,
          dell&apos;EU-US Data Privacy Framework.
        </p>
      </section>

      <section>
        <h2>6. Per quanto tempo li conserviamo</h2>
        <ul>
          <li>Dati dell&apos;account e libreria: finché tieni l&apos;account.</li>
          <li>Dati di personalizzazione: 90 giorni, poi cancellati automaticamente.</li>
          <li>Sessioni di visione di ZConnection: 90 giorni.</li>
          <li>Biglietti caricati: finché non elimini la serata o l&apos;account.</li>
          <li>
            Alla cancellazione dell&apos;account tutto viene eliminato subito. Le copie di
            sicurezza del database vengono sovrascritte secondo la rotazione del nostro
            fornitore, entro 30 giorni.
          </li>
        </ul>
      </section>

      <section>
        <h2>7. I tuoi diritti</h2>
        <p>
          Puoi accedere ai tuoi dati, correggerli, cancellarli, limitarne il trattamento,
          opporti e riceverli in formato leggibile da una macchina. Due di questi diritti
          li eserciti da solo, subito, dal tuo profilo: <em>Scarica i miei dati</em> e{" "}
          <em>Elimina l&apos;account</em>. Per tutto il resto scrivi a{" "}
          <code>&lt;EMAIL_PRIVACY&gt;</code>: rispondiamo entro trenta giorni.
        </p>
      </section>

      <section>
        <h2>8. Reclamo</h2>
        <p>
          Se ritieni che il trattamento violi il Regolamento puoi rivolgerti al Garante
          per la protezione dei dati personali (www.garanteprivacy.it) o all&apos;autorità
          dello Stato in cui risiedi.
        </p>
      </section>

      <section>
        <h2>9. Cookie</h2>
        <p>
          Zapp usa un solo cookie, quello che tiene aperta la tua sessione. È tecnicamente
          necessario a farti restare collegato, quindi non richiede il tuo consenso e non
          esiste un banner da chiudere. Non usiamo strumenti di analisi, non profiliamo la
          navigazione e non condividiamo nulla con circuiti pubblicitari.
        </p>
      </section>

      <section>
        <h2>10. Minori</h2>
        <p>
          Per iscriverti devi avere almeno 14 anni, la soglia prevista in Italia
          dall&apos;art. 2-quinquies del Codice Privacy.
        </p>
      </section>
    </LegalPage>
  );
}

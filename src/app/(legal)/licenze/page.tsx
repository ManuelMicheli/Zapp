import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Licenze e attribuzioni · Zapp",
  description: "Da dove vengono i dati, le immagini e il software che Zapp usa.",
};

export default function LicenzePage() {
  return (
    <LegalPage titolo="Licenze e attribuzioni" aggiornato="12 settembre 2026">
      <section>
        <p>
          Zapp mostra dati e immagini che non gli appartengono e gira su software scritto
          da altri. Questa pagina dice da dove viene ogni cosa e a quali condizioni la
          usiamo.
        </p>
      </section>

      <section>
        <h2>Catalogo dei film e delle serie — TMDB</h2>
        <p>
          Titoli, trame, date di uscita, generi, cast, troupe, locandine e fotogrammi
          vengono da <strong>The Movie Database</strong> (TMDB), interrogato tramite la
          sua API. Zapp non è approvato né certificato da TMDB, e l&apos;attribuzione
          richiesta è questa:
        </p>
        <p>
          <em>
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </em>
        </p>
        <p>
          In italiano: questo prodotto usa l&apos;API di TMDB, ma non è approvato né
          certificato da TMDB.{" "}
          <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
            themoviedb.org
          </a>
        </p>
      </section>

      <section>
        <h2>Indirizzi e coordinate — OpenStreetMap e Nominatim</h2>
        <p>
          La posizione che dichiari e gli indirizzi delle sale vengono trasformati in
          coordinate con <strong>Nominatim</strong>, il servizio di geocodifica di
          OpenStreetMap. I dati sono <strong>&copy; OpenStreetMap contributors</strong> e
          sono distribuiti con licenza Open Database License (ODbL) 1.0.{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            openstreetmap.org/copyright
          </a>
        </p>
      </section>

      <section>
        <h2>Meteo — Open-Meteo</h2>
        <p>
          Le previsioni che scelgono la fila di consigli del momento vengono da{" "}
          <strong>Open-Meteo.com</strong> e sono distribuite con licenza Creative Commons
          Attribution 4.0 (CC BY 4.0).{" "}
          <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
            open-meteo.com
          </a>
        </p>
      </section>

      <section>
        <h2>Trailer — YouTube</h2>
        <p>
          I trailer non sono ospitati da Zapp: sono video di <strong>YouTube</strong>,
          incorporati con il player ufficiale nella sua versione{" "}
          <code>youtube-nocookie.com</code>. La riproduzione avviene sui server di Google,
          secondo i termini di servizio di YouTube e le condizioni dei canali che li
          pubblicano.
        </p>
      </section>

      <section>
        <h2>Orari dei cinema — MyMovies e circuiti</h2>
        <p>
          Il programma delle sale viene da{" "}
          <a href="https://www.mymovies.it" target="_blank" rel="noopener noreferrer">
            MyMovies.it
          </a>{" "}
          e dai servizi pubblici dei circuiti <strong>UCI Cinemas</strong>,{" "}
          <strong>The Space Cinema</strong>, <strong>Notorious Cinemas</strong> e{" "}
          <strong>Cinelandia</strong>. Gli orari, i prezzi e la disponibilità dei posti
          appartengono a quelle fonti: Zapp li mostra per portarti alla loro biglietteria,
          dove l&apos;acquisto si conclude.
        </p>
      </section>

      <section>
        <h2>Carattere tipografico — Inter</h2>
        <p>
          Il testo dell&apos;app è composto in <strong>Inter</strong>, di Rasmus
          Andersson, distribuito con la SIL Open Font License 1.1. I file del font sono
          serviti dai nostri server, non da un servizio esterno.{" "}
          <a href="https://rsms.me/inter/" target="_blank" rel="noopener noreferrer">
            rsms.me/inter
          </a>
        </p>
      </section>

      <section>
        <h2>Software libero</h2>
        <ul>
          <li>
            <strong>jsQR</strong> — legge i codici QR dei biglietti che carichi, dentro il
            tuo browser. Licenza Apache 2.0.
          </li>
          <li>
            <strong>pdf.js</strong> (Mozilla) — apre i biglietti in PDF per ricavarne i
            codici QR, il posto e la sala, sempre dentro il tuo browser. Licenza Apache
            2.0.
          </li>
          <li>
            <strong>node-qrcode</strong> — ridisegna i codici QR a schermo pieno per il
            controllo all&apos;ingresso. Licenza MIT.
          </li>
          <li>
            <strong>Next.js</strong>, <strong>React</strong>,{" "}
            <strong>Tailwind CSS</strong>, <strong>Framer Motion</strong>,{" "}
            <strong>Papa Parse</strong> e le librerie di <strong>Supabase</strong> —
            l&apos;impalcatura dell&apos;applicazione. Licenza MIT.
          </li>
        </ul>
      </section>

      <section>
        <h2>Marchi</h2>
        <p>
          I marchi e i loghi citati appartengono ai rispettivi titolari. Zapp non è
          affiliata, sponsorizzata o approvata da nessuna delle piattaforme o dei circuiti
          citati.
        </p>
      </section>
    </LegalPage>
  );
}

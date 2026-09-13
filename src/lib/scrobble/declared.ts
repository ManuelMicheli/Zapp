/**
 * Per quanto un lancio continua a dare il nome a cio' che la TV riferisce.
 *
 * Netflix, Prime e l'app Apple TV mandano posizione e stato perfetti e **nessun
 * titolo**: l'unico modo di sapere cosa sta suonando e' che sia stata Zapp ad
 * aprirlo. Questa funzione decide quando quella deduzione vale ancora.
 *
 * La regola e' severa di proposito. Un titolo attribuito male scrive in libreria
 * una visione che non c'e' stata, e lo fa in silenzio; una dichiarazione che cade
 * lascia una sessione anonima, che si vede.
 *
 * Quello che questa funzione **non** puo' vedere: se cambi titolo col telecomando
 * e Netflix riprende il nuovo dal punto in cui avevi lasciato il vecchio (stessa
 * posizione, a pochi secondi), non c'e' nessun segnale che li distingua — ne'
 * indietro, ne' avanti. E' l'unico buco rimasto, ed e' raro: serve che due film
 * diversi siano stati interrotti quasi allo stesso minuto.
 */
export interface Dichiarazione {
  titleId: number;
  mediaType: "movie" | "tv";
  /** Quando la TV ha ritirato il comando. */
  deliveredAt: string;
  /** Ultima posizione attribuita a questa dichiarazione, se ce n'e' stata una. */
  lastPositionMs: number | null;
  lastSeenAt: string | null;
}

/** Oltre questo silenzio la dichiarazione non vale piu'. */
export const FINESTRA_MS = 30 * 60 * 1000;

/**
 * Sotto questa posizione si e' "all'inizio": se prima eravamo ben oltre, non e'
 * un riavvolgimento, e' un altro titolo.
 *
 * Deve restare **maggiore** di `SOGLIA_ANTEPRIMA_MS` in `android.ts`
 * (120.000): quella soglia scarta ogni evento sotto i due minuti, quindi il
 * primo evento del titolo nuovo che arriva qui (l'autoplay di Netflix, per
 * esempio) puo' avere posizione **esattamente** 120.000, mai meno. Se
 * `INIZIO_MS` coincidesse con quel valore (come succedeva prima), `positionMs
 * < INIZIO_MS` sarebbe sempre falsa su quell'evento e questa regola non
 * scatterebbe mai durante una riproduzione continua — coincidevano per caso,
 * e il caso non e' una garanzia (bug del 13/09: il film successivo di un
 * autoplay finiva attribuito al precedente).
 *
 * Sotto i due minuti (`SOGLIA_ANTEPRIMA_MS`) non arriva mai niente fin qui:
 * `INIZIO_MS` a cinque minuti va letto come "nella prima manciata di minuti
 * **utili**", non "nei primi cinque minuti in assoluto". E' l'invariante che
 * rende sensata la tolleranza qui sotto: uno scarto verso una posizione fra
 * zero e due minuti non e' un caso che questa funzione debba mai vedere.
 */
const INIZIO_MS = 5 * 60 * 1000;
/**
 * Tolleranza sul ballonzolare della posizione fra un battito e l'altro: i
 * battiti vanno avanti, non indietro, ma un piccolo riavvolgimento (rivedere
 * gli ultimi secondi, un buffering) non deve essere scambiato per un cambio
 * di film.
 */
const TOLLERANZA_INDIETRO_MS = 60 * 1000;
/**
 * Oltre questo salto all'indietro la dichiarazione cade comunque, anche se la
 * posizione nuova non e' vicina all'inizio: e' il caso in cui il primo evento
 * del titolo nuovo arriva gia' avanti (la TV non ha riferito per un po') — si
 * era a 45 minuti e si ricompare a 6, non e' un riavvolgimento, ma
 * `INIZIO_MS` da solo non lo vedrebbe (6 minuti non e' "all'inizio"). Un
 * riavvolgimento vero di oltre venti minuti esiste: perdere l'attribuzione del
 * resto del film in quel caso e' il danno minore, non il contrario.
 */
const SALTO_INDIETRO_MS = 20 * 60 * 1000;
/**
 * Quanto la posizione puo' correre **in avanti** piu' del tempo davvero
 * trascorso fra due eventi attribuiti, prima che si smetta di attribuire.
 *
 * E' la regola di continuita', e nasce dal limite scoperto sulla Fire TV il
 * 13/09: Netflix **riprende** un titolo gia' iniziato dal punto in cui l'avevi
 * lasciato, quindi cambiare film col telecomando non produce affatto per forza
 * un salto all'indietro — le due regole qui sopra non possono vederlo. Ma un
 * flusso solo e' vincolato dall'orologio: in trenta secondi di battito la
 * posizione avanza di trenta secondi, non di minuti. Se avanza molto di piu',
 * non e' lo stesso flusso.
 *
 * La tolleranza copre i salti in avanti legittimi dentro lo stesso titolo
 * (salta la sigla, salta il riassunto: un minuto e mezzo tipico). Un
 * avanzamento veloce piu' lungo esiste e fa cadere l'attribuzione: e' il
 * danno minore, la sessione resta anonima invece di scrivere in libreria un
 * titolo che nessuno sta guardando.
 *
 * Si controlla **solo** il lato "troppo avanti". Andare piu' piano del tempo
 * trascorso e' normale: gli eventi in pausa non arrivano mai fin qui
 * (`riproduzioneVera` passa solo `playing`), quindi una pausa di dieci minuti
 * si presenta come dieci minuti di orologio e zero di posizione.
 */
const AVANTI_TOLLERANZA_MS = 2 * 60 * 1000;

export function dichiarazioneValida(
  d: Dichiarazione,
  positionMs: number,
  adesso: string,
): boolean {
  const ora = Date.parse(adesso);
  if (!Number.isFinite(ora)) return false;

  // Stato incoerente: un solo fra i due campi valorizzato e' sospetto. Trattare
  // come se lo stato fosse corrotto, quindi scartare.
  if ((d.lastSeenAt === null) !== (d.lastPositionMs === null)) {
    return false;
  }

  // Non si e' ancora attribuito niente: valido entro la finestra. Usare valore
  // assoluto per tollerare piccoli disallineamenti di orologio fra TV e server
  // (due macchine diverse non coincidono mai al millisecondo).
  if (d.lastSeenAt === null && d.lastPositionMs === null) {
    const consegna = Date.parse(d.deliveredAt);
    if (!Number.isFinite(consegna)) return false;
    const distanza = ora - consegna;
    return Math.abs(distanza) <= FINESTRA_MS;
  }

  // Con storico: valido solo se l'ultimo avvistamento e' entro la finestra (in
  // valore assoluto, stessa regola di sopra).
  const ultimo = Date.parse(d.lastSeenAt!);
  if (!Number.isFinite(ultimo)) return false;
  const distanza = ora - ultimo;
  if (Math.abs(distanza) > FINESTRA_MS) return false;

  // Salto all'indietro grande: non e' un riavvolgimento, e' un altro titolo,
  // anche se la posizione nuova non e' vicina a zero (vedi SALTO_INDIETRO_MS).
  if (d.lastPositionMs! - positionMs > SALTO_INDIETRO_MS) return false;

  // Tornati vicino all'inizio con un salto indietro vero: e' un altro
  // titolo, non importa da dove venivamo.
  //
  // Misurato su una Fire TV il 13/09: "Fight Club" lanciato da Zapp, guardato
  // fino a 5:16 (316.000ms), poi un altro film avviato col telecomando dentro
  // Netflix; il secondo film e' arrivato a 2:27 (147.000ms) e si e' visto
  // attribuire il nome del primo. La regola prima richiedeva anche che
  // l'ultima posizione attribuita fosse sopra DENTRO_MS (dieci minuti): qui
  // era 316.000ms, sotto quella soglia, quindi la condizione non scattava
  // mai — catturava solo chi cambia film a meta', lasciando scoperto chi
  // cambia film subito dopo l'inizio, che e' il caso piu' comune. Non
  // reintrodurre DENTRO_MS qui: il lato che conta e' la posizione nuova
  // (vicina all'inizio) e la direzione del salto (indietro, non
  // ballonzolio), non "quanto dentro" eravamo prima.
  if (positionMs < INIZIO_MS && d.lastPositionMs! - positionMs > TOLLERANZA_INDIETRO_MS) {
    return false;
  }

  // Continuita': la posizione non puo' correre piu' dell'orologio. Il tempo
  // trascorso si prende non negativo perche' i due orologi (TV e server) non
  // coincidono al millisecondo e un anticipo di pochi secondi e' normale:
  // trattarlo come zero rende la regola solo piu' severa, mai piu' larga.
  const trascorso = Math.max(distanza, 0);
  const avanzamento = positionMs - d.lastPositionMs!;
  if (avanzamento - trascorso > AVANTI_TOLLERANZA_MS) return false;

  return true;
}

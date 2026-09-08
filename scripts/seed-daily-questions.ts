/**
 * Riempie `daily_questions`: una domanda al giorno a partire da domani.
 * Idempotente (`ask_on` è unique, si ignorano i duplicati), quindi si può
 * rilanciare quando si aggiungono domande in fondo all'elenco.
 *
 *   pnpm tsx --env-file=.env.local scripts/seed-daily-questions.ts
 */
import { createClient } from "@supabase/supabase-js";
import { nextDay, romeDateString } from "../src/lib/cinema/dates";

type Scope = "movie" | "tv" | "any";

/**
 * Il tono: una riga, diretta, che si può rispondere con un titolo solo.
 * `media_scope` segue il testo: se la domanda dice "film" o "serie", la ricerca
 * si limita di conseguenza.
 */
const QUESTIONS: [string, Scope][] = [
  ["Quale film rivedresti per primo se perdessi la memoria?", "movie"],
  ["La serie che hai finito in un fine settimana solo.", "tv"],
  ["Il film che ti ha fatto piangere e non lo ammetti con nessuno.", "movie"],
  ["Quello che tutti odiano e tu difendi a ogni cena.", "any"],
  ["La sigla che non salti mai.", "tv"],
  ["Il film da far vedere a chi dice di non amare il cinema.", "movie"],
  ["La serie che ti ha rovinato il sonno.", "tv"],
  ["Il finale che ti ha fatto arrabbiare di più.", "any"],
  ["Il film che hai visto più volte in assoluto.", "movie"],
  ["La serie che vorresti rivedere senza sapere già come va.", "tv"],
  ["Il film che ti ha fatto venire voglia di partire.", "movie"],
  ["Quello che hai finto di aver visto.", "any"],
  ["Il primo film che ricordi al cinema.", "movie"],
  ["La serie che guardi quando stai male.", "tv"],
  ["Il film più bello che hai visto quest'anno.", "movie"],
  ["Il cattivo che ti sta più simpatico del protagonista.", "any"],
  ["La serie che consigli a occhi chiusi.", "tv"],
  ["Il film che ti ha cambiato idea su qualcosa.", "movie"],
  ["Quello che ti ha fatto ridere fino alle lacrime.", "any"],
  ["La colonna sonora che ascolti anche senza il film.", "movie"],
  ["La serie che hai mollato e vorresti riprendere.", "tv"],
  ["Il film perfetto per una domenica di pioggia.", "movie"],
  ["Il personaggio in cui ti sei riconosciuto di più.", "any"],
  ["La serie che ha avuto una stagione di troppo.", "tv"],
  ["Il film che ti ha fatto paura da piccolo.", "movie"],
  ["Quello che rivedi ogni Natale.", "any"],
  ["La serie che ti ha fatto amare un genere che evitavi.", "tv"],
  ["Il film che dovrebbero far vedere a scuola.", "movie"],
  ["La scena che ti è rimasta addosso per giorni.", "any"],
  ["Il film che hai visto al momento giusto della tua vita.", "movie"],
  ["La serie con i dialoghi migliori.", "tv"],
  ["Quello che consiglieresti a un primo appuntamento.", "any"],
  ["Il film che ti ha fatto venire fame.", "movie"],
  ["La serie che hai visto tutta d'un fiato di notte.", "tv"],
  ["Il film sopravvalutato che non capisci.", "movie"],
  ["Quello che nessuno dei tuoi amici ha visto.", "any"],
  ["La serie che ti manca da quando è finita.", "tv"],
  ["Il film che ti ha fatto venire voglia di fare quel mestiere.", "movie"],
  ["La coppia più bella mai vista su uno schermo.", "any"],
  ["Il film che vorresti vedere in sala una volta nella vita.", "movie"],
  ["La serie che guarderesti anche solo per un personaggio.", "tv"],
  ["Il film che hai visto senza sapere niente e ti ha spiazzato.", "movie"],
  ["Quello che ti ha fatto piangere in pubblico.", "any"],
  ["La serie animata che consigli anche a chi non guarda animazione.", "tv"],
  ["Il film italiano che porteresti all'estero.", "movie"],
  ["Quello che ti ha tenuto sveglio a pensarci.", "any"],
  ["La serie che ti ha fatto venire voglia di partire per un posto.", "tv"],
  ["Il film che regaleresti a tuo padre.", "movie"],
  ["Il documentario che tutti dovrebbero vedere.", "any"],
  ["La serie con il pilot migliore di sempre.", "tv"],
  ["Il film che ti ha fatto scoprire un regista.", "movie"],
  ["Quello che hai iniziato tre volte e mai finito.", "any"],
  ["La serie che rivedi dall'inizio ogni tanto.", "tv"],
  ["Il film più strano che hai amato.", "movie"],
  ["Il titolo che ti ha rovinato una giornata, in senso buono.", "any"],
  ["La serie che ti ha fatto affezionare a un posto immaginario.", "tv"],
  ["Il film che guardi con il telefono lontano.", "movie"],
  ["La storia d'amore che ti ha convinto davvero.", "any"],
  ["La serie che spieghi male ma consigli comunque.", "tv"],
  ["Il film che ti ha fatto capire tuo fratello o tua sorella.", "movie"],
  ["Quello che vedresti stasera se dovessi scegliere in dieci secondi.", "any"],
  ["La serie che avresti scritto tu.", "tv"],
  ["Il film in bianco e nero che ami di più.", "movie"],
  ["Il titolo che difendi anche se sai che non è un capolavoro.", "any"],
  ["La serie che hai visto insieme a qualcuno e ora vi appartiene.", "tv"],
  ["Il film che ti ha fatto venire voglia di leggere il libro.", "movie"],
  ["La scena d'apertura più bella che ricordi.", "any"],
  ["La serie che ti ha fatto restare sveglio fino alle tre.", "tv"],
  ["Il film che consiglieresti a chi ha quindici anni.", "movie"],
  ["Quello che rivedresti volentieri con dieci anni di meno.", "any"],
  ["La serie che ha il finale che meritava.", "tv"],
  ["Il film che ti ha fatto amare una città.", "movie"],
  ["Il titolo che hai visto per sbaglio e ti è rimasto.", "any"],
  ["La serie che guardi mentre cucini.", "tv"],
  ["Il film che consiglieresti a chi non riesce a dormire.", "movie"],
  ["Il personaggio che vorresti come amico.", "any"],
  ["La serie di cui aspetti la prossima stagione.", "tv"],
  ["Il film che ti ha fatto piangere per una cosa bella.", "movie"],
  ["Quello che descriveresti con una parola sola.", "any"],
  ["La serie che ti ha insegnato qualcosa che usi davvero.", "tv"],
];

async function main() {
  // `src/lib/supabase/server.ts` è `server-only`: fuori da Next il client si
  // costruisce a mano, come negli altri script.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  let day = nextDay(romeDateString());
  const rows = QUESTIONS.map(([text, media_scope]) => {
    const row = { ask_on: day, text, media_scope };
    day = nextDay(day);
    return row;
  });
  const { error } = await supabase
    .from("daily_questions")
    .upsert(rows, { onConflict: "ask_on", ignoreDuplicates: true });
  if (error) throw error;
  console.log(
    `${rows.length} domande, dal ${rows[0].ask_on} al ${rows[rows.length - 1].ask_on}`,
  );
}

void main();

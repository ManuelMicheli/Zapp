# AGENTS.md

Guida per Codex in questa repository.

**Le regole del progetto stanno in [`CLAUDE.md`](CLAUDE.md)** — indice, comandi, regole
non negoziabili — e il dettaglio dei sottosistemi in [`docs/architecture/`](docs/architecture/).
Valgono identiche qui: non sono duplicate in questo file apposta, perche' due copie
divergono alla prima modifica (questa e' gia' successo: la versione precedente di
AGENTS.md era una copia invecchiata di CLAUDE.md, archiviata in
`docs/project/legacy/AGENTS-2026-09-12-superato.md` e da non usare come riferimento).

Scrivi qui **solo** cio' che riguarda Codex e non l'applicazione.

## Regia e risparmio token (preferenza utente)

- GPT-6 Astra dirige: definisce soluzione, istruzioni operative, vincoli e criteri di accettazione; rivede il diff e le verifiche prima della consegna.
- Delegare l'implementazione a GPT-5.4; usare GPT-5.4 mini per compiti piccoli, circoscritti e con esito verificabile. Astra gestisce ambiguita', decisioni architetturali e correzioni critiche.
- Ogni incarico indica obiettivo, file di competenza, riferimenti necessari e verifiche. Passare solo il contesto pertinente; richiedere un resoconto breve con file modificati, esiti e problemi aperti. Gli agenti non devono annullare modifiche altrui.
- Evitare analisi e implementazioni duplicate: Astra scrive il piano, l'esecutore il codice. Parallelizzare solo compiti indipendenti quando utile; niente deleghe senza un compito concreto.
- Usare esclusivamente modelli realmente selezionabili. Se i modelli richiesti non sono disponibili, dichiararlo: questa preferenza non abilita modelli e non autorizza sostituzioni silenziose.
- Mantenere tutte le regole di sicurezza e le verifiche del progetto. Nessuna promessa di perfezione o di risparmio senza misurazione; distinguere token consumati, costo e quota del piano.


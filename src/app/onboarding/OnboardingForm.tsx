"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { AUTH_FIELD_WRAP_CLASS } from "@/components/auth/field";
import { ConsentCheckbox } from "@/components/legal/ConsentCheckbox";
import { accettaDocumenti } from "@/lib/legal/actions";
import { ETA_MINIMA } from "@/lib/legal/versions";
import { SEED_MAX_PICKS, type SeedCandidate } from "@/lib/taste/seed";
import { completeOnboarding, type OnboardingState } from "./actions";
import { PlatformPicker } from "./PlatformPicker";
import { caricaSeedPerEta } from "./seed-actions";
import { SeedGrid } from "./SeedGrid";
import { SeedSearch } from "./SeedSearch";

const initialState: OnboardingState = { error: null };

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * Stessa regola della Server Action, ripetuta qui solo per dirlo subito: l'anno è
 * obbligatorio e sotto i 14 anni l'account non si apre (art. 2-quinquies del Codice
 * Privacy). La verifica che conta resta quella del server.
 */
function controllaAnno(grezzo: string): string | null {
  const anno = Number(grezzo);
  const annoCorrente = new Date().getFullYear();
  if (!Number.isInteger(anno) || anno < 1900 || anno > annoCorrente) {
    return "Inserisci il tuo anno di nascita.";
  }
  if (annoCorrente - anno < ETA_MINIMA) {
    return `Per usare Zapp devi avere almeno ${ETA_MINIMA} anni.`;
  }
  return null;
}

/**
 * Onboarding in quattro passi (0: documenti, 1: chi sei, 2: gusti, 3: piattaforme),
 * **una sola rotta e una sola Server Action**.
 *
 * `onboarding_completed_at` si scrive solo alla fine: chi abbandona a metà e
 * riapre l'app ricomincia dal passo 1 senza aver perso niente e senza finire in un
 * limbo (il layout `(app)` rimanda qui finché quella colonna è nulla).
 *
 * Senza candidati (classifiche e trending entrambi giù) il passo 2 non esiste e dal
 * passo 1 si va dritti al passo 3: l'iscrizione non si rompe mai per la griglia, e le
 * piattaforme restano comunque richieste.
 *
 * Il passo 0 non smonta il resto: il form resta montato e solo nascosto, così
 * nessun campo si rimonta e nessun valore si perde. Nascosto significa anche
 * irraggiungibile — non c'è bottone da premere né campo da mettere a fuoco — quindi
 * `required` e `pattern` dei campi non possono bloccare un invio invisibile.
 */
export function OnboardingForm({
  initialDisplayName,
  seedCandidates,
}: {
  initialDisplayName: string;
  seedCandidates: SeedCandidate[];
}) {
  const [state, formAction, pending] = useActionState(completeOnboarding, initialState);
  const [passo, setPasso] = useState<0 | 1 | 2 | 3>(0);
  const [accettato, setAccettato] = useState(false);
  const [salvaConsensi, avviaConsensi] = useTransition();
  const [scelti, setScelti] = useState<string[]>([]);
  /** Le piattaforme dichiarate al passo 3: servono a /benvenuto per proporre gli import. */
  const [piattaforme, setPiattaforme] = useState<string[]>([]);
  const [erroreLocale, setErroreLocale] = useState<string | null>(null);
  /**
   * La griglia mostrata. Parte da quella calcolata a pagina caricata — l'anno di
   * nascita ancora non esisteva — e viene sostituita da quella tarata sull'età appena
   * arriva. I titoli cercati a mano stanno in testa: sono gli unici scelti davvero.
   */
  const [griglia, setGriglia] = useState<SeedCandidate[]>(seedCandidates);
  const [cercati, setCercati] = useState<SeedCandidate[]>([]);
  const [, avviaTaratura] = useTransition();
  /** I campi del passo 1, presi quando si va avanti: al passo 2 viaggiano nascosti. */
  const [dati, setDati] = useState({ username: "", displayName: "", birthYear: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const seedRef = useRef<HTMLInputElement>(null);
  const piattaformeRef = useRef<HTMLInputElement>(null);

  const conGriglia = seedCandidates.length > 0;

  // Al passo 2 la testata della pagina ("Scegli il tuo username") è falsa: il titolo
  // giusto lo porta il foglio. Sta in un componente server, fuori da questo form, e
  // l'unico modo di spegnerla senza spostare mezza pagina in un client component è
  // toccarne la classe. Tre righe, e il testo non mente mai.
  useEffect(() => {
    const intro = document.querySelectorAll<HTMLElement>("[data-onb-intro]");
    intro.forEach((el) => el.classList.toggle("!hidden", passo !== 1));
    return () => intro.forEach((el) => el.classList.remove("!hidden"));
  }, [passo]);

  const toggle = (key: string) =>
    setScelti((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const togglePiattaforma = (key: string) =>
    setPiattaforme((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  /** Un titolo cercato entra in testa alla griglia **già scelto**, e non si ripete. */
  const scegliCercato = (c: SeedCandidate) => {
    const chiave = `${c.mediaType}-${c.id}`;
    setCercati((prev) =>
      prev.some((p) => p.mediaType === c.mediaType && p.id === c.id)
        ? prev
        : [c, ...prev],
    );
    setScelti((prev) => (prev.includes(chiave) ? prev : [...prev, chiave]));
  };

  // I cercati in testa, e la griglia senza i loro doppioni: lo stesso titolo non deve
  // comparire due volte con due caselle che si spuntano da sole a vicenda.
  const chiaviCercate = new Set(cercati.map((c) => `${c.mediaType}-${c.id}`));
  const daMostrare = [
    ...cercati,
    ...griglia.filter((c) => !chiaviCercate.has(`${c.mediaType}-${c.id}`)),
  ];

  const valore = (nome: string) =>
    String(
      (formRef.current?.elements.namedItem(nome) as HTMLInputElement | null)?.value ?? "",
    ).trim();

  /**
   * Valida i campi del passo 1 e porta a `passoSuccessivo`: 2 quando c'è una griglia
   * di gusti da mostrare, 3 (piattaforme) quando non c'è. La taratura della griglia
   * ha senso solo per il passo 2: al passo 3 non esiste nessuna griglia da tarare.
   */
  const avanti = (passoSuccessivo: 2 | 3) => {
    // Lo username si normalizza **qui**, e da qui in poi viaggia normalizzato.
    // Prima veniva validato in minuscolo ma lasciato nel campo com'era scritto: chi
    // scriveva "Manuel" superava questo controllo e poi, al passo 2, il campo era
    // invalido per il suo `pattern`, il browser bloccava l'invio e — essendo quel
    // campo `display:none` — non poteva nemmeno dirlo. Il bottone non faceva niente,
    // in silenzio (segnalato dall'utente il 2026-09-08).
    const username = valore("username").toLowerCase();
    if (!USERNAME_RE.test(username)) {
      setErroreLocale(
        "Username non valido: 3–20 caratteri, solo lettere minuscole, numeri e underscore.",
      );
      return;
    }
    const birthYear = valore("birth_year");
    const erroreAnno = controllaAnno(birthYear);
    if (erroreAnno) {
      setErroreLocale(erroreAnno);
      return;
    }
    setErroreLocale(null);
    setDati({ username, displayName: valore("display_name"), birthYear });
    setPasso(passoSuccessivo);

    if (passoSuccessivo === 2) {
      // La griglia su misura si chiede **dopo** aver mostrato il passo 2: chi si
      // iscrive non deve guardare un bottone che non risponde mentre TMDB ci pensa.
      // Se torna vuota (rete giù, anno rifiutato) resta quella di base.
      avviaTaratura(async () => {
        const suMisura = await caricaSeedPerEta(Number(birthYear)).catch(() => []);
        if (suMisura.length > 0) setGriglia(suMisura);
      });
    }
  };

  /**
   * L'accettazione si scrive **prima** del resto: se la scrittura fallisce si resta
   * qui, altrimenti si finirebbe dentro l'app senza consenso registrato.
   */
  const accetta = () => {
    setErroreLocale(null);
    avviaConsensi(async () => {
      const esito = await accettaDocumenti();
      if (!esito.ok) {
        setErroreLocale(esito.error ?? "Non è stato possibile salvare. Riprova.");
        return;
      }
      setPasso(1);
    });
  };

  return (
    <>
      {passo === 0 && (
        <div className="flex flex-col">
          <h2 className="text-[22px] font-bold leading-tight tracking-[-0.03em] text-text">
            Benvenuto su Zapp
          </h2>
          <p className="mt-2 text-[13px] leading-[1.45] text-muted">
            Prima di cominciare, due documenti: cosa puoi aspettarti da Zapp e cosa
            facciamo dei tuoi dati.
          </p>
          <ConsentCheckbox checked={accettato} onChange={setAccettato} />
          {erroreLocale && (
            <p className="mt-4 px-1 text-sm text-danger">{erroreLocale}</p>
          )}
          <Button
            type="button"
            className="mt-6 w-full"
            disabled={!accettato || salvaConsensi}
            onClick={accetta}
          >
            {salvaConsensi ? "Salvataggio…" : "Continua"}
          </Button>
        </div>
      )}

      <form
        ref={formRef}
        action={formAction}
        className={passo === 0 ? "hidden" : "flex flex-col gap-[22px]"}
      >
        {/* Al passo 2 i campi del passo 1 non restano nascosti con `display:none`: un
        campo invisibile ma ancora soggetto a `required` e `pattern` blocca l'invio
        senza poter mostrare l'errore, ed è il modo migliore per fabbricare un bottone
        che "non funziona". Diventano `input type="hidden"`, che per specifica sono
        esclusi dalla validazione del browser. */}
        {passo === 1 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className={`${AUTH_FIELD_WRAP_CLASS} gap-0.5`}>
                <span className="text-muted">@</span>
                <input
                  id="username"
                  name="username"
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-z0-9_]{3,20}"
                  autoCapitalize="none"
                  autoCorrect="off"
                  aria-label="Username"
                  placeholder="es. cinefilo_92"
                  className="flex-1 bg-transparent text-[17px] font-medium text-text outline-none placeholder:text-muted"
                />
              </div>
              <p className="px-1 text-xs text-muted-2">
                3–20 caratteri: lettere minuscole, numeri, underscore.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className={`${AUTH_FIELD_WRAP_CLASS} justify-between gap-2`}>
                <input
                  id="display_name"
                  name="display_name"
                  maxLength={50}
                  defaultValue={initialDisplayName}
                  aria-label="Nome visualizzato"
                  className="flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-muted"
                />
                <span className="shrink-0 text-xs text-muted-2">opzionale</span>
              </div>
              <p className="px-1 text-xs text-muted-2">Nome visualizzato</p>
            </div>

            <div className="flex flex-col gap-2">
              <div className={`${AUTH_FIELD_WRAP_CLASS} justify-between gap-2`}>
                <input
                  id="birth_year"
                  name="birth_year"
                  required
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  placeholder="1998"
                  aria-label="Anno di nascita"
                  className="flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-muted"
                />
              </div>
              <p className="px-1 text-xs text-muted-2">
                Anno di nascita. Serve a confermare che hai almeno {ETA_MINIMA} anni e a
                calibrare i consigli sui decenni. Non compare sul tuo profilo.
              </p>
            </div>
          </div>
        ) : (
          <>
            <input type="hidden" name="username" value={dati.username} readOnly />
            <input type="hidden" name="display_name" value={dati.displayName} readOnly />
            <input type="hidden" name="birth_year" value={dati.birthYear} readOnly />
          </>
        )}

        {passo === 2 && (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <h2 className="text-[22px] font-bold leading-tight tracking-[-0.03em] text-text">
                Quali di questi ti piacciono?
              </h2>
              <p className="text-[13px] leading-[1.45] text-muted">
                Bastano un paio di titoli per farci capire i tuoi gusti. Puoi anche
                saltare.
              </p>
            </div>
            <SeedSearch
              selected={scelti}
              pieno={scelti.length >= SEED_MAX_PICKS}
              onPick={scegliCercato}
            />
            <SeedGrid candidates={daMostrare} selected={scelti} onToggle={toggle} />
          </div>
        )}

        {passo === 3 && (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <h2 className="text-[22px] font-bold leading-tight tracking-[-0.03em] text-text">
                Cosa guardi?
              </h2>
              <p className="text-[13px] leading-[1.45] text-muted">
                Serve a riempirti la libreria: ti porto subito a recuperare quello che hai
                già visto.
              </p>
            </div>
            <PlatformPicker scelte={piattaforme} onToggle={togglePiattaforma} />
          </div>
        )}

        <input
          ref={seedRef}
          type="hidden"
          name="seed"
          value={JSON.stringify(scelti)}
          readOnly
        />
        <input
          ref={piattaformeRef}
          type="hidden"
          name="platforms"
          value={JSON.stringify(piattaforme)}
          readOnly
        />

        {(state.error || erroreLocale) && (
          <p className="px-1 text-sm text-danger">{state.error ?? erroreLocale}</p>
        )}

        {passo === 1 ? (
          <Button
            type="button"
            onClick={() => avanti(conGriglia ? 2 : 3)}
            className="w-full"
          >
            Continua
          </Button>
        ) : passo === 2 ? (
          // Non invia più: porta al passo delle piattaforme, che viene sempre, con
          // o senza gusti scelti.
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={() => setPasso(3)} className="w-full">
              Continua
            </Button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                // Il campo si azzera nel DOM, non con `setScelti`: React non
                // rirenderizza prima del passo successivo, e la scelta resterebbe.
                if (seedRef.current) seedRef.current.value = "[]";
                setPasso(3);
              }}
              className="py-2 text-[13px] font-medium text-muted"
            >
              Salta
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Mai disabilitato oltre al salvataggio: un bottone grigio che non dice
            perché è grigio è indistinguibile da un bottone rotto, ed è esattamente
            così che è stato segnalato (2026-09-08). Le scelte sono un aiuto, non un
            pedaggio: si può entrare anche senza. */}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Salvataggio…" : "Continua"}
            </Button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                // Stesso motivo del passo dei gusti: si azzera nel DOM e si invia
                // subito, senza aspettare un rerender che arriverebbe dopo.
                if (piattaformeRef.current) piattaformeRef.current.value = "[]";
                formRef.current?.requestSubmit();
              }}
              className="py-2 text-[13px] font-medium text-muted"
            >
              Salta
            </button>
          </div>
        )}
      </form>
    </>
  );
}

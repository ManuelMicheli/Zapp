"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { AUTH_FIELD_WRAP_CLASS } from "@/components/auth/field";
import type { SeedCandidate } from "@/lib/taste/seed";
import { completeOnboarding, type OnboardingState } from "./actions";
import { SeedGrid } from "./SeedGrid";

const initialState: OnboardingState = { error: null };

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

/**
 * Onboarding in due passi, **una sola rotta e una sola Server Action**.
 *
 * `onboarding_completed_at` si scrive solo alla fine: chi abbandona al passo 2 e
 * riapre l'app ricomincia dal passo 1 senza aver perso niente e senza finire in un
 * limbo (il layout `(app)` rimanda qui finché quella colonna è nulla).
 *
 * Senza candidati (classifiche e trending entrambi giù) il passo 2 non esiste e il
 * primo bottone invia direttamente: l'iscrizione non si rompe mai per la griglia.
 */
export function OnboardingForm({
  initialDisplayName,
  seedCandidates,
}: {
  initialDisplayName: string;
  seedCandidates: SeedCandidate[];
}) {
  const [state, formAction, pending] = useActionState(completeOnboarding, initialState);
  const [passo, setPasso] = useState<1 | 2>(1);
  const [scelti, setScelti] = useState<string[]>([]);
  const [erroreLocale, setErroreLocale] = useState<string | null>(null);
  /** I campi del passo 1, presi quando si va avanti: al passo 2 viaggiano nascosti. */
  const [dati, setDati] = useState({ username: "", displayName: "", birthYear: "" });
  const formRef = useRef<HTMLFormElement>(null);
  const seedRef = useRef<HTMLInputElement>(null);

  const conGriglia = seedCandidates.length > 0;

  // Al passo 2 la testata della pagina ("Scegli il tuo username") è falsa: il titolo
  // giusto lo porta il foglio. Sta in un componente server, fuori da questo form, e
  // l'unico modo di spegnerla senza spostare mezza pagina in un client component è
  // toccarne la classe. Tre righe, e il testo non mente mai.
  useEffect(() => {
    const intro = document.querySelectorAll<HTMLElement>("[data-onb-intro]");
    intro.forEach((el) => el.classList.toggle("!hidden", passo === 2));
    return () => intro.forEach((el) => el.classList.remove("!hidden"));
  }, [passo]);

  const toggle = (key: string) =>
    setScelti((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const valore = (nome: string) =>
    String(
      (formRef.current?.elements.namedItem(nome) as HTMLInputElement | null)?.value ?? "",
    ).trim();

  const avanti = () => {
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
    setErroreLocale(null);
    setDati({
      username,
      displayName: valore("display_name"),
      birthYear: valore("birth_year"),
    });
    setPasso(2);
  };

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-[22px]">
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
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                placeholder="1998"
                aria-label="Anno di nascita"
                className="flex-1 bg-transparent text-[16px] text-text outline-none placeholder:text-muted"
              />
              <span className="shrink-0 text-xs text-muted-2">opzionale</span>
            </div>
            <p className="px-1 text-xs text-muted-2">
              Anno di nascita. Serve solo a consigliarti meglio: puoi non dirlo.
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
              Bastano un paio di titoli per farci capire i tuoi gusti. Puoi anche saltare.
            </p>
          </div>
          <SeedGrid candidates={seedCandidates} selected={scelti} onToggle={toggle} />
        </div>
      )}

      <input
        ref={seedRef}
        type="hidden"
        name="seed"
        value={JSON.stringify(scelti)}
        readOnly
      />

      {(state.error || erroreLocale) && (
        <p className="px-1 text-sm text-danger">{state.error ?? erroreLocale}</p>
      )}

      {passo === 1 && conGriglia ? (
        <Button type="button" onClick={avanti} className="w-full">
          Continua
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Mai disabilitato oltre al salvataggio: un bottone grigio che non dice
            perché è grigio è indistinguibile da un bottone rotto, ed è esattamente
            così che è stato segnalato (2026-09-08). Le scelte sono un aiuto, non un
            pedaggio: si può entrare anche senza. */}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Salvataggio…" : "Inizia a usare Zapp"}
          </Button>
          {passo === 2 && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                // Il campo si azzera nel DOM, non con `setScelti`: React non
                // rirenderizza prima dell'invio, e la scelta partirebbe lo stesso.
                if (seedRef.current) seedRef.current.value = "[]";
                formRef.current?.requestSubmit();
              }}
              className="py-2 text-[13px] font-medium text-muted"
            >
              Salta
            </button>
          )}
        </div>
      )}
    </form>
  );
}

"use client";

import { useCallback, useOptimistic, useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toaster";

/**
 * Il giro che ogni comando dell'app deve fare: applicare subito il risultato atteso,
 * chiamare la Server Action, e se la risposta non è `ok` tornare indietro con un toast.
 * Prima stava copiato a mano in quindici componenti, ognuno un po' diverso.
 */

/** Il minimo che ogni Server Action del progetto ritorna. */
export interface MutationResult {
  ok: boolean;
  error?: string;
}

/** Errore generico, uguale ovunque. */
export const DEFAULT_ERROR = "Qualcosa è andato storto. Riprova.";

export interface RunOptions {
  /** Toast di conferma dopo una risposta ok. */
  message?: string;
  /** "Annulla" nel toast di conferma. */
  undo?: () => void;
  /** Girato dopo una risposta ok: per `router.refresh()` e simili. */
  onDone?: () => void;
}

type Run<T> = (
  next: T,
  action: () => Promise<MutationResult>,
  options?: RunOptions,
) => void;

/**
 * Due valori del server sono lo stesso valore? Il confronto è per contenuto, non per
 * riferimento: una prop passata come oggetto o array viene ricostruita a ogni render, e
 * confrontarla per riferimento farebbe risincronizzare all'infinito.
 */
export function sameServerValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Valore che il server possiede e il client anticipa. Alla fine della transizione
 * l'anticipo cade e torna a valere `serverValue` — che nel frattempo è arrivato
 * aggiornato, perché la risposta di una Server Action porta con sé il rendering nuovo
 * della pagina aperta. Da usare per le azioni che rivalidano **questa** rotta.
 */
export function useOptimisticValue<T>(serverValue: T): {
  value: T;
  pending: boolean;
  run: Run<T>;
} {
  const { show } = useToast();
  const [value, setValue] = useOptimistic(serverValue, (_prev: T, next: T) => next);
  const [pending, startTransition] = useTransition();

  const run = useCallback<Run<T>>(
    (next, action, options) => {
      startTransition(async () => {
        setValue(next);
        try {
          const result = await action();
          if (!result.ok) {
            show(result.error ?? DEFAULT_ERROR);
            return;
          }
          if (options?.message) show(options.message, { onUndo: options.undo });
          options?.onDone?.();
        } catch (e) {
          // Idem: un rifiuto della Server Action senza questo restava muto e
          // l'anticipo ottimistico non tornava mai al valore del server. Qui
          // basta non fare nulla: alla fine della transizione `useOptimistic`
          // torna da solo a `serverValue`.
          console.error("[optimistic] azione rifiutata:", e);
          show(DEFAULT_ERROR);
        }
      });
    },
    [setValue, show],
  );

  return { value, pending, run };
}

/**
 * Come sopra, ma il valore **resta** dopo la transizione e si risincronizza quando il
 * server ne manda uno nuovo. Serve dove l'azione rivalida altre rotte e non rirende la
 * pagina aperta (una stella "preferito" su una scheda titolo, i bottoni amicizia su
 * `/u/[username]`): lì `useOptimistic` tornerebbe al valore vecchio appena chiusa la
 * transizione, e si vedrebbe il salto indietro.
 */
export function useMirroredValue<T>(serverValue: T): {
  value: T;
  pending: boolean;
  run: Run<T>;
  set: (next: T) => void;
} {
  const { show } = useToast();
  const [value, setValue] = useState(serverValue);
  const [pending, startTransition] = useTransition();
  // Pattern documentato di React per "adjusting state on a prop change": uno
  // `useRef` aggiornato durante il render si perde se quel render viene scartato
  // (una Suspense che rilancia, un render concorrente abbandonato) e la card
  // resta sul valore vecchio finché il server non ne manda un altro diverso.
  // Con lo stato invece il confronto e l'aggiornamento fanno parte del render
  // stesso: se il render è scartato, si rifà da capo con lo stesso esito.
  const [lastServer, setLastServer] = useState(serverValue);
  if (!sameServerValue(lastServer, serverValue)) {
    setLastServer(serverValue);
    setValue(serverValue);
  }

  const run = useCallback<Run<T>>(
    (next, action, options) => {
      const previous = value;
      setValue(next);
      startTransition(async () => {
        try {
          const result = await action();
          if (!result.ok) {
            setValue(previous);
            show(result.error ?? DEFAULT_ERROR);
            return;
          }
          if (options?.message) show(options.message, { onUndo: options.undo });
          options?.onDone?.();
        } catch (e) {
          // La Server Action può rifiutare prima di ritornare un risultato
          // (offline, timeout, un `throw` fuori dal try interno): senza questo
          // l'utente restava con il valore ottimistico e nessun avviso.
          console.error("[optimistic] azione rifiutata:", e);
          setValue(previous);
          show(DEFAULT_ERROR);
        }
      });
    },
    [show, value],
  );

  return { value, pending, run, set: setValue };
}

/** Lista senza la riga di quella chiave. */
export function withoutKey<T>(items: T[], keyOf: (item: T) => string, key: string): T[] {
  return items.filter((item) => keyOf(item) !== key);
}

/** Lista con la riga di pari chiave sostituita (nessun inserimento se manca). */
export function withReplaced<T>(items: T[], keyOf: (item: T) => string, next: T): T[] {
  const key = keyOf(next);
  return items.map((item) => (keyOf(item) === key ? next : item));
}

/** Lista con la riga in fondo, se quella chiave non c'è già. */
export function withAppended<T>(items: T[], keyOf: (item: T) => string, item: T): T[] {
  const key = keyOf(item);
  return items.some((i) => keyOf(i) === key) ? items : [...items, item];
}

/**
 * Prima pagina dal server + pagine caricate dal client, senza doppioni e con il server
 * che comanda: una riga che il server non manda più sparisce anche dalle pagine dopo.
 */
export function mergePages<T>(server: T[], more: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set(server.map(keyOf));
  return [...server, ...more.filter((item) => !seen.has(keyOf(item)))];
}

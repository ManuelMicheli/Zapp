"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ToastOptions {
  /** Callback per "Annulla": se presente il toast mostra il bottone. */
  onUndo?: () => void;
  durationMs?: number;
}

interface ToastState {
  id: number;
  message: string;
  onUndo?: () => void;
}

const ToastContext = createContext<{
  show: (message: string, options?: ToastOptions) => void;
} | null>(null);

/** Fuori da un `<Toaster>`: si logga e si tace, non si butta giù la pagina. */
const TOAST_ASSENTE = {
  show: (message: string) => {
    console.error(`[toast] nessun <Toaster> sopra questo componente: "${message}"`);
  },
};

/**
 * Fuori da un `<Toaster>` questo hook **sollevava**, e chi lo chiamava senza saperlo si
 * portava dietro l'intera pagina: `AvatarPicker` usa `useMirroredValue`, che usa
 * `useToast`, e sta anche in `/onboarding`, che vive fuori dal layout `(app)` — l'unico
 * posto dove il `<Toaster>` era montato. Risultato: **500 sulla pagina di registrazione**,
 * e chi si era appena iscritto non riusciva più a entrare (2026-09-08).
 *
 * Un avviso che non si può mostrare è un avviso perso, non un motivo per far cadere
 * tutto. La guardia resta, ma come log.
 */
export function useToast() {
  return useContext(ToastContext) ?? TOAST_ASSENTE;
}

export function Toaster({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const show = useCallback((message: string, options?: ToastOptions) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++idRef.current;
    setToast({ id, message, onUndo: options?.onUndo });
    timerRef.current = setTimeout(() => {
      setToast((t) => (t?.id === id ? null : t));
    }, options?.durationMs ?? 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+var(--nav-bottom)+144px)] z-50 mx-auto w-fit max-w-[calc(100%-2rem)]"
          >
            <div className="flex items-center gap-4 rounded-[20px] border border-border bg-surface-2 px-4 py-3 shadow-xl">
              <p className="text-sm">{toast.message}</p>
              {toast.onUndo && (
                <button
                  type="button"
                  className="text-sm font-bold text-accent"
                  onClick={() => {
                    toast.onUndo?.();
                    setToast(null);
                  }}
                >
                  Annulla
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

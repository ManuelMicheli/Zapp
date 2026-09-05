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

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast fuori da <Toaster>");
  return ctx;
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

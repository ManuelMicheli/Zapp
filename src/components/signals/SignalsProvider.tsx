"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { MAX_EVENTS_PER_BATCH, type ClientKind } from "@/lib/taste/events";
import { parseSignal, type SignalTarget } from "@/lib/taste/surfaces";

/** Ogni quanto si svuota la coda. */
const FLUSH_MS = 5_000;
/** Quanto una copertina deve restare visibile perché conti come vista. */
const DWELL_MS = 1_000;
/** Quanta parte della copertina deve essere sullo schermo. */
const RATIO = 0.5;
/** Tetto per sessione: nessuna sessione può diventare un fiume di richieste. */
const MAX_BATCHES = 20;

interface Coda {
  kind: ClientKind;
  titleId: number;
  mediaType: "movie" | "tv";
  surface: string;
  position: number | null;
  at: string;
}

interface Api {
  record: (kind: ClientKind, target: SignalTarget) => void;
}

const Ctx = createContext<Api>({ record: () => {} });

/** I segnali dai componenti client (piattaforma aperta, trailer partito). */
export function useSignals(): Api {
  return useContext(Ctx);
}

/**
 * La raccolta dei segnali impliciti della fase A.
 *
 * Un solo `IntersectionObserver` per tutta l'app, più un `MutationObserver` per gli
 * elementi che arrivano dopo (scaffali, "Carica altri"): le copertine si dichiarano
 * con `data-signal`, quindi **restano componenti server** — è lo stesso schema del
 * `PreviewLayer`, che ascolta un solo `pointerover` sul documento.
 *
 * `sessionId` sta in memoria e muore con la scheda: le regole del progetto vietano
 * `localStorage` e `sessionStorage` per i dati dell'utente. È anche ciò che rende
 * onesto lo skip: "visto in N sessioni e mai aperto" conta le sessioni vere.
 *
 * Da spento non aggancia niente: nessun observer, nessuna coda, nessuna richiesta.
 */
export function SignalsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const coda = useRef<Coda[]>([]);
  const inviati = useRef(0);
  /** Impression già mandate in questa sessione: `titolo|superficie`. */
  const viste = useRef(new Set<string>());
  const sessionId = useRef<string>("");
  if (!sessionId.current && typeof crypto !== "undefined" && crypto.randomUUID) {
    sessionId.current = crypto.randomUUID();
  }

  const flush = useCallback((beacon: boolean) => {
    if (coda.current.length === 0 || !sessionId.current) return;
    if (inviati.current >= MAX_BATCHES) {
      coda.current = [];
      return;
    }
    const events = coda.current.splice(0, MAX_EVENTS_PER_BATCH);
    inviati.current += 1;
    const payload = JSON.stringify({ sessionId: sessionId.current, events });

    // Alla chiusura della scheda `fetch` viene interrotta: solo `sendBeacon` arriva.
    if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/events",
        new Blob([payload], { type: "application/json" }),
      );
      return;
    }
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // La telemetria non deve mai disturbare l'app: un lotto perso è perso.
    });
  }, []);

  const record = useCallback(
    (kind: ClientKind, target: SignalTarget) => {
      if (!enabled) return;
      if (kind === "impression") {
        const chiave = `${target.mediaType}-${target.titleId}|${target.surface}`;
        if (viste.current.has(chiave)) return;
        viste.current.add(chiave);
      }
      coda.current.push({
        kind,
        titleId: target.titleId,
        mediaType: target.mediaType,
        surface: target.surface,
        position: target.position,
        at: new Date().toISOString(),
      });
      if (coda.current.length >= MAX_EVENTS_PER_BATCH) flush(false);
    },
    [enabled, flush],
  );

  useEffect(() => {
    if (!enabled) return;

    const attesa = new Map<Element, ReturnType<typeof setTimeout>>();

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target;
          if (entry.isIntersecting && entry.intersectionRatio >= RATIO) {
            if (attesa.has(el)) continue;
            attesa.set(
              el,
              setTimeout(() => {
                attesa.delete(el);
                const t = parseSignal(el.getAttribute("data-signal"));
                if (t) record("impression", t);
                io.unobserve(el);
              }, DWELL_MS),
            );
          } else {
            const timer = attesa.get(el);
            if (timer) {
              clearTimeout(timer);
              attesa.delete(el);
            }
          }
        }
      },
      { threshold: [RATIO] },
    );

    const osserva = (root: ParentNode) => {
      root.querySelectorAll?.("[data-signal]").forEach((el) => io.observe(el));
    };
    osserva(document);

    const mo = new MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType !== 1) continue;
          const el = n as Element;
          if (el.hasAttribute("data-signal")) io.observe(el);
          osserva(el);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // L'apertura: un solo ascoltatore sul documento, come il PreviewLayer.
    const onPointerDown = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.("[data-signal]");
      if (!el) return;
      const t = parseSignal(el.getAttribute("data-signal"));
      if (t) record("open", t);
    };
    document.addEventListener("pointerdown", onPointerDown, { passive: true });

    const timer = setInterval(() => flush(false), FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      for (const t of attesa.values()) clearTimeout(t);
      io.disconnect();
      mo.disconnect();
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("visibilitychange", onHide);
      clearInterval(timer);
      flush(true);
    };
  }, [enabled, record, flush]);

  const api = useMemo(() => ({ record }), [record]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

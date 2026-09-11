"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { LiveSession } from "@/lib/watch/live";
import type { FriendLiveSession } from "@/lib/watch/social-live";
import { presenceState, visiblePresence } from "@/lib/watch/presence";

/**
 * Cosa i dispositivi collegati stanno riproducendo adesso, tenuto aggiornato
 * mentre la home è aperta.
 *
 * ZConnection scrive in libreria mentre si guarda su Netflix, cioè fuori da
 * Zapp: senza questo, il minutaggio resta quello del momento in cui la pagina è
 * stata resa e "Continua a guardare" mostra l'ordine di allora. Due meccanismi,
 * di costo molto diverso:
 *
 * - **il minutaggio parte dalle misure confermate** (`LiveProgress`) e avanza
 *   localmente durante playing, senza scrivere stime in libreria;
 * - **la pagina si rifà solo quando cambia cosa si sta guardando** — un altro
 *   episodio, un altro titolo, o un titolo che prima non era nella fila. Rifare
 *   la home a intervalli vorrebbe dire rirenderizzare carosello, scaffali e
 *   sezioni cinema per aggiornare due numeri.
 */
const WatchingContext = createContext<LiveSession[]>([]);
const FriendsContext = createContext<FriendLiveSession[] | null>(null);
const ClockContext = createContext(0);
const PlaybackClockContext = createContext<() => number>(() => 0);
export function usePlaybackClock() {
  return useContext(PlaybackClockContext);
}
export function useFriendsLive() {
  return useContext(FriendsContext);
}
export function useLiveClock() {
  return useContext(ClockContext);
}

export function useWatching(): LiveSession[] {
  return useContext(WatchingContext);
}

/** Ogni quanto si chiede cosa sta andando, mentre la scheda è in primo piano. */
const POLL_MS = 10_000;

/** Identità di ciò che si sta guardando: se cambia, la pagina va rifatta. */
function impronta(sessions: LiveSession[]): string {
  return sessions
    .map(
      (s) =>
        `${s.mediaType}:${s.titleId}:${s.seasonNumber ?? ""}:${s.episodeNumber ?? ""}:${s.providerId ?? ""}`,
    )
    .join("|");
}

export function WatchingProvider({
  children,
  friendId,
}: {
  children: ReactNode;
  friendId?: string;
}) {
  const router = useRouter();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [friends, setFriends] = useState<FriendLiveSession[] | null>(null);
  const [now, setNow] = useState(0);
  const clockOffset = useRef(0);
  const playbackClock = useCallback(() => Date.now() + clockOffset.current, []);
  // Impronta dell'ultimo stato per cui la pagina è stata rifatta: serve a non
  // rifarla a ogni sondaggio quando non è cambiato niente.
  const resa = useRef<string | null>(null);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    let inFlight = false;
    const controller = new AbortController();
    const clock = setInterval(() => setNow(Date.now() + clockOffset.current), 1000);

    async function chiedi() {
      if (!vivo || inFlight) return;
      if (timer) clearTimeout(timer);
      // In secondo piano non si chiede niente: la fila la si guarda quando la
      // si guarda, e il primo sondaggio al ritorno la rimette a posto.
      if (document.hidden) return pianifica();
      inFlight = true;
      try {
        const res = await fetch(
          friendId
            ? `/api/watching?friend=${encodeURIComponent(friendId)}`
            : "/api/watching",
          { cache: "no-store", signal: controller.signal },
        );
        if (!res.ok) {
          if (vivo) {
            setFriends([]);
            setSessions([]);
          }
          return;
        }
        const dati = (await res.json()) as {
          sessions: LiveSession[];
          friends: FriendLiveSession[];
          serverNow: number;
        };
        if (!vivo) return;
        const nuove = dati.sessions ?? [];
        clockOffset.current = dati.serverNow - Date.now();
        setNow(dati.serverNow);
        setFriends(dati.friends ?? []);
        setSessions(nuove);

        const ora = impronta(nuove);
        // Alla prima risposta si prende nota e basta: la pagina è appena stata
        // resa dal server, rifarla subito sarebbe una richiesta buttata.
        if (resa.current === null) resa.current = ora;
        else if (ora !== resa.current) {
          resa.current = ora;
          if (!friendId) router.refresh();
        }
      } catch {
        // rete ballerina: si riprova al giro dopo, senza dire niente
      } finally {
        inFlight = false;
        pianifica();
      }
    }

    function pianifica() {
      if (!vivo) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(chiedi, POLL_MS);
    }

    // Al ritorno sulla scheda si chiede subito, senza aspettare il giro.
    function alRitorno() {
      if (!document.hidden) chiedi();
    }

    chiedi();
    document.addEventListener("visibilitychange", alRitorno);
    return () => {
      vivo = false;
      controller.abort();
      clearInterval(clock);
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", alRitorno);
    };
  }, [router, friendId]);

  return (
    <PlaybackClockContext.Provider value={playbackClock}>
      <ClockContext.Provider value={now}>
        <WatchingContext.Provider value={sessions.filter((s) => presenceState(s, now))}>
          <FriendsContext.Provider
            value={friends === null ? null : visiblePresence(friends, now)}
          >
            {children}
          </FriendsContext.Provider>
        </WatchingContext.Provider>
      </ClockContext.Provider>
    </PlaybackClockContext.Provider>
  );
}

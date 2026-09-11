"use client";
import type { FriendLiveSession } from "@/lib/watch/social-live";
import { visiblePresence } from "@/lib/watch/presence";
import { FriendsWatchingRow } from "@/components/home/FriendsWatchingRow";
import {
  WatchingProvider,
  useFriendsLive,
  useLiveClock,
} from "@/components/home/WatchingProvider";

function Content({
  initial,
  renderedAt,
}: {
  initial: FriendLiveSession[];
  renderedAt: number;
}) {
  const current = useFriendsLive();
  const now = useLiveClock() || renderedAt;
  const live = visiblePresence(current ?? initial, now);
  if (!live.length) return null;
  return (
    <section className="mt-7 space-y-3" aria-label="Visione attuale">
      <h2 className="px-5 text-xl font-bold lg:px-10">
        {live[0].state === "playing" ? "Sta guardando ora" : "Visione in pausa"}
      </h2>
      <FriendsWatchingRow items={live} live={live} />
    </section>
  );
}
export function FriendLive({
  userId,
  initial,
  renderedAt,
}: {
  userId: string;
  initial: FriendLiveSession[];
  renderedAt: number;
}) {
  return (
    <WatchingProvider friendId={userId}>
      <Content initial={initial} renderedAt={renderedAt} />
    </WatchingProvider>
  );
}

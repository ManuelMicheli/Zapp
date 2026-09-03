import { getFriendsWatching } from "@/lib/social/queries";

/** "Guardato da Marco, Sara" sotto Dove guardarlo. */
export async function FriendsWatching({
  titleId,
  mediaType,
}: {
  titleId: number;
  mediaType: "movie" | "tv";
}) {
  const friends = await getFriendsWatching(titleId, mediaType);
  if (friends.length === 0) return null;

  const names = friends.map((f) => f.displayName ?? f.username);
  const label =
    names.length <= 3
      ? names.join(", ")
      : `${names.slice(0, 3).join(", ")} e altri ${names.length - 3}`;

  return (
    <p className="px-4 text-xs text-muted">
      <span className="text-accent">●</span> Guardato da {label}
    </p>
  );
}

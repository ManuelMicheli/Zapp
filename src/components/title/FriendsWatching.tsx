import { Fragment } from "react";
import { Avatar } from "@/components/social/Avatar";
import { getFriendsWatching } from "@/lib/social/queries";

/** "Guardato da Elena e Marco" sotto Dove guardarlo. */
export async function FriendsWatching({
  titleId,
  mediaType,
}: {
  titleId: number;
  mediaType: "movie" | "tv";
}) {
  const friends = await getFriendsWatching(titleId, mediaType);
  if (friends.length === 0) return null;

  const shown = friends.slice(0, 3);
  const extra = friends.length - shown.length;

  return (
    <div className="flex items-center gap-2 px-5 text-[13px] text-white/70 md:px-0">
      <div className="flex items-center">
        {shown.map((f, i) => (
          <div
            key={f.username}
            className="rounded-full ring-2 ring-bg"
            style={{ marginLeft: i === 0 ? 0 : -8 }}
          >
            <Avatar url={f.avatarUrl} name={f.displayName ?? f.username} size={22} />
          </div>
        ))}
      </div>
      <p className="min-w-0">
        Guardato da{" "}
        {shown.map((f, i) => {
          const name = f.displayName ?? f.username;
          return (
            <Fragment key={f.username}>
              {i > 0 && (i === shown.length - 1 && extra === 0 ? " e " : ", ")}
              <b className="font-semibold text-text">{name}</b>
            </Fragment>
          );
        })}
        {extra > 0 && ` e altri ${extra}`}
      </p>
    </div>
  );
}

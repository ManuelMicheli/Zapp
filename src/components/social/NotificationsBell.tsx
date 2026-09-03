import Link from "next/link";
import { getUnreadNotificationCount } from "@/lib/social/queries";

export async function NotificationsBell() {
  const count = await getUnreadNotificationCount();

  return (
    <Link
      href="/notifications"
      aria-label={`Notifiche${count > 0 ? `, ${count} non lette` : ""}`}
      className="relative flex size-10 items-center justify-center rounded-full hover:bg-surface"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

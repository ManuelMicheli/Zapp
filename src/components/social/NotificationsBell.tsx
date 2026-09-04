import { getUnreadNotificationCount } from "@/lib/social/queries";
import { GlassIconButton } from "@/components/layout/GlassIconButton";

export async function NotificationsBell() {
  const count = await getUnreadNotificationCount();

  return (
    <div className="relative">
      <GlassIconButton
        href="/notifications"
        label={`Notifiche${count > 0 ? `, ${count} non lette` : ""}`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      </GlassIconButton>
      {count > 0 && (
        <span className="absolute right-2 top-2 size-[9px] rounded-full border-2 border-bg bg-accent" />
      )}
    </div>
  );
}

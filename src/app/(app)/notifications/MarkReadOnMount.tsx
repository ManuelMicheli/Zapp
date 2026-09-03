"use client";

import { useEffect } from "react";
import { markNotificationsRead } from "@/lib/social/actions";

export function MarkReadOnMount({ hasUnread }: { hasUnread: boolean }) {
  useEffect(() => {
    if (hasUnread) void markNotificationsRead();
  }, [hasUnread]);
  return null;
}

"use client";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useToast } from "@/components/ui/Toaster";
import { toggleActivityLike } from "@/lib/social/actions";

/** Cuore in vetro sul banner del feed: toggle ottimistico col conteggio. */
export function ActivityLikeButton({
  activityId,
  count,
  liked,
}: {
  activityId: string;
  count: number;
  liked: boolean;
}) {
  const [state, setState] = useState({ liked, count });
  const [, startTransition] = useTransition();
  const { show } = useToast();

  function toggle() {
    const next = !state.liked;
    const prev = state;
    setState({ liked: next, count: Math.max(0, prev.count + (next ? 1 : -1)) });
    startTransition(async () => {
      const res = await toggleActivityLike(activityId, next);
      if (!res.ok) {
        setState(prev);
        show(res.error ?? "Errore");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={state.liked}
      aria-label={state.liked ? "Togli mi piace" : "Mi piace"}
      className="glass flex flex-col items-center gap-0.5 rounded-full px-2.5 py-2 leading-none"
    >
      <motion.svg
        key={state.liked ? "on" : "off"}
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill={state.liked ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={state.liked ? "text-accent" : "text-white"}
        aria-hidden="true"
      >
        <path d="M20.8 6.6a5 5 0 0 0-7.1 0L12 8.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />
      </motion.svg>
      {state.count > 0 && (
        <span className="text-[11px] font-semibold text-white">{state.count}</span>
      )}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppLink } from "@/components/ui/AppLink";
import { playbackPreparer } from "@/lib/links/playback-client";

interface ConnectionWithSaveData {
  saveData?: boolean;
}

export function PlaybackLink({
  href,
  providerId,
  ariaLabel,
  className,
  children,
}: {
  href: string;
  providerId: number | null;
  ariaLabel: string;
  className: string;
  children: ReactNode;
}) {
  const anchorRef = useRef<HTMLAnchorElement>(null);
  const alive = useRef(true);
  const generation = useRef(0);
  const visible = useRef(false);
  const [prepared, setPrepared] = useState({ source: href, href });
  const eligible = href.startsWith("/play/");

  const prepare = useCallback(() => {
    if (!eligible || document.visibilityState === "hidden") return;
    const connection = (navigator as Navigator & { connection?: ConnectionWithSaveData })
      .connection;
    if (connection?.saveData) return;
    const current = generation.current;
    void playbackPreparer.prepare(href).then((ready) => {
      if (alive.current && generation.current === current && ready) {
        setPrepared({ source: href, href: ready });
      }
    });
  }, [eligible, href]);

  useEffect(() => {
    generation.current++;
    alive.current = true;
    visible.current = false;
    const node = anchorRef.current;
    if (!node || !eligible || !("IntersectionObserver" in window)) {
      return () => {
        alive.current = false;
      };
    }
    const observer = new IntersectionObserver((entries) => {
      visible.current = entries.some((entry) => entry.isIntersecting);
      if (visible.current && document.visibilityState !== "hidden") {
        prepare();
      }
    });
    observer.observe(node);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") return;
      playbackPreparer.resume();
      if (visible.current) prepare();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive.current = false;
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [eligible, href, prepare]);

  return (
    <AppLink
      anchorRef={anchorRef}
      href={prepared.source === href ? prepared.href : href}
      providerId={providerId}
      ariaLabel={ariaLabel}
      className={className}
      onPointerEnter={prepare}
      onFocus={prepare}
      onTouchStart={prepare}
    >
      {children}
    </AppLink>
  );
}

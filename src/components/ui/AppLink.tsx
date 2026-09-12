"use client";

import type { CSSProperties, MouseEvent, ReactNode, Ref } from "react";
import { nativeOpen } from "@/lib/links/native-app";
import { postToNative } from "@/lib/native/bridge";

/**
 * Link verso una piattaforma streaming. Si comporta come un `<a target="_blank">`
 * normale; per le piattaforme che non passano da sole alla app nativa (oggi solo
 * Disney+, vedi `src/lib/links/native-app.ts`) apre invece l'app:
 * intent esplicito su Android, navigazione top-level su iOS.
 *
 * Dentro il guscio nativo non si naviga affatto: l'URL torna al guscio, che lo
 * apre fuori dalla WebView e lascia al sistema il passaggio all'app.
 */
export function AppLink({
  href,
  providerId,
  className,
  style,
  ariaLabel,
  dataSignalTap,
  onClick,
  anchorRef,
  onPointerEnter,
  onFocus,
  onTouchStart,
  children,
}: {
  href: string;
  /** ID TMDB della piattaforma: senza, il link resta quello di sempre. */
  providerId?: number | null;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
  /** Segnale per il profilo di gusto (vedi `signalTap` di `ProviderButton`). */
  dataSignalTap?: string;
  onClick?: () => void;
  anchorRef?: Ref<HTMLAnchorElement>;
  onPointerEnter?: () => void;
  onFocus?: () => void;
  onTouchStart?: () => void;
  children: ReactNode;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.();
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.button !== 0) {
      return;
    }
    const plan = nativeOpen({ url: href, providerId, ua: navigator.userAgent });
    if (plan.mode === "default") return;
    if (plan.mode === "native-shell") {
      // la WebView non deve muoversi: se ne va fuori solo l'URL
      event.preventDefault();
      postToNative({ type: "openExternal", url: plan.href });
      return;
    }
    // niente nuova scheda: l'intent Android e l'universal link iOS vogliono una
    // navigazione della finestra corrente per arrivare all'app
    event.preventDefault();
    window.location.href = plan.href;
  }

  return (
    <a
      ref={anchorRef}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={className}
      style={style}
      data-signal-tap={dataSignalTap}
      onClick={handleClick}
      onPointerEnter={onPointerEnter}
      onFocus={onFocus}
      onTouchStart={onTouchStart}
    >
      {children}
    </a>
  );
}

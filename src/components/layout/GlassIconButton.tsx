import Link from "next/link";
import type { ReactNode } from "react";

interface Props {
  label: string;
  href?: string;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}

/** Cerchio 40px in vetro con icona: azione in testata sopra immagini. */
export function GlassIconButton({
  label,
  href,
  onClick,
  children,
  className = "",
}: Props) {
  const cls = `glass flex size-10 items-center justify-center rounded-full text-text ${className}`;
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

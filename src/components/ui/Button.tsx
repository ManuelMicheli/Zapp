import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white shadow-[var(--shadow-accent)] hover:bg-accent-strong disabled:opacity-50",
  secondary: "glass text-text hover:bg-white/15 disabled:opacity-50",
  ghost: "text-text hover:bg-surface disabled:opacity-50",
  danger:
    "border border-danger/20 bg-danger/10 text-danger hover:bg-danger/15 disabled:opacity-50",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Pillola h-54 (h-14 in Tailwind = 56px, usiamo h-[54px] per il mockup). */
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex h-[54px] items-center justify-center gap-2 rounded-full px-6 text-[17px] font-semibold transition-colors ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

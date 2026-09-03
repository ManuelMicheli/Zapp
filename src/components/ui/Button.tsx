import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-strong disabled:opacity-50",
  secondary:
    "border border-border bg-surface text-text hover:bg-surface-2 disabled:opacity-50",
  ghost: "text-text hover:bg-surface disabled:opacity-50",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`rounded-xl px-5 py-3 text-base font-semibold transition-colors ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

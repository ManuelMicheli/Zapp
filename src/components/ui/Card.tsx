import type { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-[20px] border border-border bg-surface ${className}`}
      {...props}
    />
  );
}

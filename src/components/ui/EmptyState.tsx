import type { ReactNode } from "react";
import Image from "next/image";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-border bg-surface px-6 py-8 text-center">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-surface-2">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={34}
          height={34}
          className="rounded-[9px]"
        />
      </div>
      <p className="mt-3 text-lg font-bold tracking-[-0.02em]">{title}</p>
      {description && (
        <p className="mt-1.5 text-pretty text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

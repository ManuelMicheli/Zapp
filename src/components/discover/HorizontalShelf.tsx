import Link from "next/link";
import type { ReactNode } from "react";

export function HorizontalShelf({
  title,
  seeAllHref,
  children,
}: {
  title: string;
  seeAllHref?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between px-4">
        <h2 className="text-base font-bold">{title}</h2>
        {seeAllHref && (
          <Link href={seeAllHref} className="text-xs font-medium text-accent">
            Vedi tutti
          </Link>
        )}
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto px-4 pb-1">
        {children}
      </div>
    </section>
  );
}

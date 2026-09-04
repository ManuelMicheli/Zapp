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
      <div className="mb-3 flex items-baseline justify-between px-5 lg:px-10">
        <h2 className="text-xl font-bold tracking-[-0.03em]">{title}</h2>
        {seeAllHref && (
          <Link href={seeAllHref} className="text-[13px] font-medium text-accent-soft">
            Vedi tutti
          </Link>
        )}
      </div>
      <div className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 lg:px-10">
        {children}
      </div>
    </section>
  );
}

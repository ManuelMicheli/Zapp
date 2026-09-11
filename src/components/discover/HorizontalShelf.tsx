import { HorizontalScroll } from "@/components/ui/HorizontalScroll";
import Link from "next/link";
import type { ReactNode } from "react";

export function HorizontalShelf({
  title,
  seeAllHref,
  eyebrow,
  aside,
  children,
}: {
  title: string;
  seeAllHref?: string;
  /** Riga piccola sopra il titolo: la usa la fila del momento per il contesto. */
  eyebrow?: string;
  /** Riga sotto il titolo: le pillole del mood. */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 px-5 lg:px-10">
        {eyebrow && (
          <p className="mb-1 text-[13px] font-medium text-accent-soft">{eyebrow}</p>
        )}
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-bold tracking-[-0.03em]">{title}</h2>
          {seeAllHref && (
            <Link href={seeAllHref} className="text-[13px] font-medium text-accent-soft">
              Vedi tutti
            </Link>
          )}
        </div>
        {aside}
      </div>
      <HorizontalScroll label={title} className="scrollbar-none flex gap-3 overflow-x-auto px-5 pb-1 md:gap-4 lg:gap-5 lg:px-10">
        {children}
      </HorizontalScroll>
    </section>
  );
}

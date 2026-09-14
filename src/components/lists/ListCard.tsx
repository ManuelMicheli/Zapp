import Link from "next/link";
import type { TitleListSummary } from "@/lib/lists/queries";

export function ListCard({ list }: { list: TitleListSummary }) {
  return (
    <Link
      href={`/lists/${list.id}`}
      className="flex min-h-36 flex-col rounded-[20px] border border-border bg-surface p-5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold leading-snug">{list.name}</h2>
          {list.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted">{list.description}</p>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-white/[0.1] px-2.5 py-1 text-[11px] text-muted">
          {list.role === "owner"
            ? "Tua"
            : list.role === "editor"
              ? "Modifica"
              : "Sola lettura"}
        </span>
      </div>
      <div className="mt-auto pt-5">
        <p className="text-sm font-medium text-muted">
          <span className="text-base font-semibold text-text">{list.itemCount}</span>{" "}
          {list.itemCount === 1 ? "titolo" : "titoli"}
        </p>
      </div>
    </Link>
  );
}

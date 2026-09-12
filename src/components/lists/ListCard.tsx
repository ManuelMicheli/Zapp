import Link from "next/link";
import type { TitleListSummary } from "@/lib/lists/queries";

export function ListCard({ list }: { list: TitleListSummary }) {
  return (
    <Link
      href={`/lists/${list.id}`}
      className="block rounded-[18px] border border-white/[0.08] bg-white/[0.04] p-4 transition-colors hover:bg-white/[0.07]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{list.name}</h2>
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
      <p className="mt-4 text-xs text-muted">
        {list.itemCount} {list.itemCount === 1 ? "titolo" : "titoli"}
      </p>
    </Link>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/social/Avatar";
import { searchUsers, type UserSearchResult } from "@/lib/social/actions";

export function UserSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setResults(await searchUsers(q));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca utenti per username…"
        autoCapitalize="none"
        className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-accent"
      />
      {results.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {results.map((r) => (
            <Link
              key={r.id}
              href={`/u/${r.username}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface p-2.5 hover:bg-surface-2"
              onClick={() => setQuery("")}
            >
              <Avatar url={r.avatar_url} name={r.display_name ?? r.username ?? "?"} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {r.display_name ?? r.username}
                </p>
                <p className="truncate text-xs text-muted">@{r.username}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

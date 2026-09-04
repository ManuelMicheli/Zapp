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
      <div className="flex h-12 items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.08] px-4 focus-within:border focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/[0.16]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-muted"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca utenti per username…"
          autoCapitalize="none"
          className="w-full bg-transparent text-[15px] text-white placeholder:text-muted outline-none"
        />
      </div>
      {results.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-2">
          {results.map((r) => (
            <Link
              key={r.id}
              href={`/u/${r.username}`}
              className="flex items-center gap-3 rounded-[20px] border border-border bg-surface px-3 py-2.5 hover:bg-surface-2"
              onClick={() => setQuery("")}
            >
              <Avatar
                url={r.avatar_url}
                name={r.display_name ?? r.username ?? "?"}
                size={38}
              />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-white">
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

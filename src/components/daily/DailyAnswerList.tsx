"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { posterUrl } from "@/lib/config";
import { Avatar } from "@/components/social/Avatar";
import { fetchDailyAnswers, reportDailyAnswer } from "@/lib/daily/actions";
import type { DailyAnswerItem } from "@/lib/daily/queries";
import { useToast } from "@/components/ui/Toaster";

/** Le risposte di oggi, dalla più recente. Mai per voti: vedi la spec. */
export function DailyAnswerList() {
  const { show } = useToast();
  const [items, setItems] = useState<DailyAnswerItem[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    void fetchDailyAnswers().then((rows) => {
      if (alive) setItems(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!items) {
    return (
      <p className="py-4 text-[13px] text-white/80 [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
        Caricamento…
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="py-4 text-[13px] text-white/80 [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
        Ancora nessuna risposta oggi. Sii il primo.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
        Le risposte di oggi
      </p>
      <ul className="flex w-full flex-col">
        {items
          .filter((a) => !hidden.includes(a.id))
          .map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 border-t border-white/10 py-3 first:border-t-0"
            >
              <Link href={`/title/${a.mediaType}/${a.titleId}`} className="shrink-0">
                <div className="relative aspect-[2/3] w-12 overflow-hidden rounded-[10px] bg-surface-2">
                  {a.posterPath && (
                    <Image
                      src={posterUrl(a.posterPath, "w185")!}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  )}
                </div>
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
                  {a.title}
                </p>
                {a.reason && (
                  <p className="text-[13px] text-white/90 [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
                    «{a.reason}»
                  </p>
                )}
                {a.authorUsername ? (
                  <Link
                    href={`/u/${a.authorUsername}`}
                    className="mt-1 flex w-fit items-center gap-2"
                  >
                    <Avatar url={a.authorAvatar} name={a.authorName} size={20} />
                    <span className="text-[12px] text-white/85 [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
                      {a.authorName}
                    </span>
                  </Link>
                ) : (
                  <div className="mt-1 flex items-center gap-2">
                    <Avatar url={a.authorAvatar} name={a.authorName} size={20} />
                    <span className="text-[12px] text-white/85 [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]">
                      {a.authorName}
                    </span>
                  </div>
                )}
              </div>
              {!a.mine && a.reason && (
                <button
                  type="button"
                  className="shrink-0 text-[12px] text-white/70 [text-shadow:0_1px_10px_rgba(0,0,0,0.85),0_1px_2px_rgba(0,0,0,0.7)]"
                  onClick={async () => {
                    const res = await reportDailyAnswer(a.id);
                    show(
                      res.ok ? "Segnalata" : (res.error ?? "Non è riuscito, riprova."),
                    );
                    if (res.ok) setHidden((h) => [...h, a.id]);
                  }}
                >
                  Segnala
                </button>
              )}
            </li>
          ))}
      </ul>
    </div>
  );
}

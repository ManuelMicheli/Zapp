import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/layout/BackButton";
import { ListItems } from "@/components/lists/ListItems";
import { ListMembersSheet } from "@/components/lists/ListMembersSheet";
import { ListSettingsSheet } from "@/components/lists/ListSettingsSheet";
import { ListSuggestionsSection } from "@/components/lists/ListSuggestionsSection";
import { getList } from "@/lib/lists/queries";
import { getFriendsData } from "@/lib/social/queries";

function SuggestionsLoading() {
  return (
    <section aria-label="Caricamento suggerimenti">
      <div className="h-8 w-52 animate-pulse rounded-lg bg-surface-2" />
      <div className="mt-3 h-4 w-full max-w-lg animate-pulse rounded bg-surface-2" />
      <div className="mt-6 grid grid-cols-2 gap-3 min-[390px]:grid-cols-3 sm:grid-cols-4 lg:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))] lg:gap-5">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="aspect-[2/3] animate-pulse rounded-[14px] bg-surface-2"
          />
        ))}
      </div>
    </section>
  );
}

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const list = await getList(id);
  if (!list) notFound();
  const { friends } = await getFriendsData();
  const canEdit = list.role === "owner" || list.role === "editor";
  const shared = list.memberCount > 1;

  return (
    <main className="pb-16">
      <header className="px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10 lg:pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
        <div className="flex min-h-10 items-center gap-3 pr-[calc(var(--nav-actions)+12px-20px)] lg:pr-0">
          <BackButton inline />
          <Link
            data-crumb
            href="/lists"
            className="text-[13px] font-medium text-accent-soft"
          >
            Liste
          </Link>
        </div>

        <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-8">
          <div className="min-w-0 flex-1">
            <h1 className="max-w-5xl break-words text-[34px] font-bold leading-[1.02] tracking-[-0.045em] sm:text-[40px] lg:text-[48px]">
              {list.name}
            </h1>
            {list.description && (
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
                {list.description}
              </p>
            )}
            <p className="mt-4 text-sm text-muted">
              {list.itemCount} {list.itemCount === 1 ? "titolo" : "titoli"}
              {shared && (
                <>
                  {" · "}
                  {list.memberCount} membri
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:max-w-[42%] lg:shrink-0 lg:justify-end">
            <ListMembersSheet
              listId={list.id}
              members={list.members}
              friends={friends}
              canManage={list.role === "owner"}
            />
            {list.role === "owner" && (
              <ListSettingsSheet
                listId={list.id}
                name={list.name}
                description={list.description}
                defaultRole={list.defaultRole}
              />
            )}
            <span className="rounded-full border border-white/[0.1] px-3 py-1.5 text-xs text-muted">
              {list.role === "owner"
                ? "Proprietario"
                : list.role === "editor"
                  ? "Puoi modificare"
                  : "Sola lettura"}
            </span>
          </div>
        </div>
      </header>

      <section aria-labelledby="list-items-title" className="mt-10 px-5 lg:px-10">
        <h2
          id="list-items-title"
          className="mb-5 text-[26px] font-bold leading-tight tracking-[-0.035em] sm:text-[30px]"
        >
          Nella lista
        </h2>
        <ListItems listId={list.id} items={list.items} canEdit={canEdit} />
      </section>

      {canEdit && (
        <div className="mt-14 border-t border-border px-5 pt-10 lg:px-10">
          <Suspense fallback={<SuggestionsLoading />}>
            <ListSuggestionsSection listId={list.id} shared={shared} />
          </Suspense>
        </div>
      )}
    </main>
  );
}

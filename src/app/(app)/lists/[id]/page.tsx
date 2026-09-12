import Link from "next/link";
import { notFound } from "next/navigation";
import { getList } from "@/lib/lists/queries";
import { ListItems } from "@/components/lists/ListItems";
import { ListMembersSheet } from "@/components/lists/ListMembersSheet";
import { ListSettingsSheet } from "@/components/lists/ListSettingsSheet";
import { getFriendsData } from "@/lib/social/queries";
import { BackButton } from "@/components/layout/BackButton";

export default async function ListDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const list = await getList(id);
  if (!list) notFound();
  const { friends } = await getFriendsData();
  return (
    <main className="pb-16">
      <div className="px-5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
        {/* Indietro + briciola: la briciola non e' un doppione del tondo, serve a
            chi apre la lista da un link e non ha cronologia da cui tornare. */}
        <div className="flex min-h-10 items-center gap-3">
          <BackButton inline />
          <Link
            data-crumb
            href="/lists"
            className="text-[13px] font-medium text-accent-soft"
          >
            Liste
          </Link>
        </div>
        {/* Sotto `sm` i tre chip non stanno accanto al titolo su uno schermo da
            390px: uscivano dal bordo destro. Vanno su una riga propria, e da
            `sm` tornano a fianco del titolo. */}
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-[32px] font-bold leading-tight break-words">
              {list.name}
            </h1>
            {list.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted">{list.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
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
        <p className="mt-4 text-sm text-muted">
          {list.members.length} {list.members.length === 1 ? "membro" : "membri"} ·{" "}
          {list.itemCount} titoli
        </p>
      </div>
      <div className="mt-6 px-5 lg:px-10">
        <ListItems
          listId={list.id}
          items={list.items}
          canEdit={list.role === "owner" || list.role === "editor"}
        />
      </div>
    </main>
  );
}

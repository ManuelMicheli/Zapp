import { EmptyState } from "@/components/ui/EmptyState";
import { TopBar } from "@/components/layout/TopBar";
import { CreateListSheet } from "@/components/lists/CreateListSheet";
import { ListCard } from "@/components/lists/ListCard";
import { getMyLists } from "@/lib/lists/queries";
import { getFriendsData } from "@/lib/social/queries";

export const metadata = { title: "Liste" };

export default async function ListsPage() {
  const lists = await getMyLists();
  const { friends } = await getFriendsData();
  return (
    <main className="pb-16">
      {/* Non e' una voce di nav: indietro + briciola, come ogni pagina in cui si
          scende (la briciola serve a chi arriva da un link condiviso e non ha
          cronologia; il tondo a chi ce l'ha). */}
      <TopBar
        title="Liste"
        back
        parent={{ label: "Libreria", href: "/library" }}
        action={<CreateListSheet friends={friends} />}
      />
      <div className="mt-2 px-5 lg:px-10">
        {lists.length === 0 ? (
          <EmptyState
            title="Ancora nessuna lista"
            description="Crea una lista per raccogliere i titoli che vuoi vedere."
            action={
              <CreateListSheet friends={friends} />
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <ListCard key={list.id} list={list} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

import { TopBar } from "@/components/layout/TopBar";
import { SearchClient } from "./SearchClient";

export const metadata = { title: "Cerca" };

export default function SearchPage() {
  return (
    <>
      <TopBar title="Cerca" />
      <main className="px-4 pb-28">
        <SearchClient />
      </main>
    </>
  );
}

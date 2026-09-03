import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { EmptyState } from "@/components/ui/EmptyState";

export default function HomePage() {
  return (
    <>
      <TopBar title="Sto guardando" />
      <main className="px-4 pb-28">
        <EmptyState
          title="Non stai guardando nulla"
          description="Cerca un titolo per iniziare."
          action={
            <Link
              href="/search"
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-strong"
            >
              Cerca un titolo
            </Link>
          }
        />
      </main>
    </>
  );
}

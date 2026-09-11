import { TopBar } from "@/components/layout/TopBar";
import { SagaCard } from "@/components/sagas/SagaCard";
import { SAGAS } from "@/lib/sagas/catalog";

export const metadata = { title: "Saghe e universi" };

export default function SagasPage() {
  return (
    <>
      <TopBar
        title="Saghe e universi"
        back
        parent={{ label: "Scopri", href: "/discover" }}
      />
      <main className="px-5 pb-16 lg:px-10">
        <p className="mb-7 max-w-2xl text-base leading-relaxed text-muted">
          Da quale film si comincia? Scegli una saga, trova il tuo ordine e riparti dai
          capitoli che ti mancano.
        </p>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {SAGAS.map((saga) => (
            <SagaCard key={saga.slug} saga={saga} />
          ))}
        </div>
      </main>
    </>
  );
}

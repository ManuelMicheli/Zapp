import { TopBar } from "@/components/layout/TopBar";

export default function Loading() {
  return (
    <>
      <TopBar title="Saga" back parent={{ label: "Saghe e universi", href: "/sagas" }} />
      <main
        className="px-5 pb-16 lg:px-10"
        aria-busy="true"
        aria-label="Caricamento film"
      >
        <div className="mb-8 h-80 rounded-[20px] bg-surface" />
        <div className="mb-7 h-12 w-72 max-w-full rounded-full bg-surface-2" />
        <div className="grid gap-2 md:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] md:gap-x-5 md:gap-y-8">
          {Array.from({ length: 12 }, (_, i) => (
            <div
              key={i}
              className="h-36 rounded-[10px] bg-surface motion-safe:animate-pulse md:aspect-[2/3] md:h-auto md:rounded-[14px]"
            />
          ))}
        </div>
      </main>
    </>
  );
}

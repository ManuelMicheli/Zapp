import { TopBar } from "@/components/layout/TopBar";

export default function Loading() {
  return (
    <>
      <TopBar title="Saghe e universi" back />
      <main
        className="px-5 pb-16 lg:px-10"
        aria-busy="true"
        aria-label="Caricamento saghe"
      >
        <div className="mb-7 h-12 max-w-2xl rounded bg-surface" />
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className="aspect-[16/10] rounded-[20px] bg-surface motion-safe:animate-pulse"
            />
          ))}
        </div>
      </main>
    </>
  );
}

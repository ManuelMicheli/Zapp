export default function Loading() {
  return (
    <main className="px-5 pb-16 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
      <div className="h-8 w-56 animate-pulse rounded bg-white/[0.08]" />
      <div className="mt-6 grid grid-cols-3 gap-4 md:grid-cols-4 lg:grid-cols-6">
        <div className="aspect-[2/3] animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="aspect-[2/3] animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="aspect-[2/3] animate-pulse rounded-xl bg-white/[0.06]" />
      </div>
    </main>
  );
}

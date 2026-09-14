export default function Loading() {
  return (
    <main className="px-5 pb-16 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
      <div className="h-10 w-32 animate-pulse rounded bg-white/[0.08]" />
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <div className="h-36 animate-pulse rounded-[20px] bg-white/[0.06]" />
        <div className="h-36 animate-pulse rounded-[20px] bg-white/[0.06]" />
      </div>
    </main>
  );
}

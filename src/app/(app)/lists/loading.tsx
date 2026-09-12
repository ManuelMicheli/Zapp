export default function Loading() {
  return (
    <main className="px-5 pb-16 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+20px)] lg:px-10">
      <div className="h-10 w-32 animate-pulse rounded bg-white/[0.08]" />
      <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-32 animate-pulse rounded-[18px] bg-white/[0.06]" />
        <div className="h-32 animate-pulse rounded-[18px] bg-white/[0.06]" />
      </div>
    </main>
  );
}

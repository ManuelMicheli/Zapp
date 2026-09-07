import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="pb-16 lg:mx-auto lg:max-w-[940px]">
      <div className="px-5 pb-4 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)] lg:px-10">
        <Skeleton className="h-9 w-36 rounded" />
      </div>
      <div className="flex flex-col gap-3 px-5 lg:gap-5 lg:px-10">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton
            key={i}
            className="aspect-[16/9] w-full rounded-[24px] lg:aspect-[21/9] lg:rounded-[28px]"
          />
        ))}
      </div>
    </div>
  );
}

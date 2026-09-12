import Link from "next/link";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/layout/BackButton";
import { isSourceSlug, SOURCE_SLUGS, SOURCES } from "@/lib/import/sources/registry";
import { ImportClient } from "./ImportClient";

export function generateStaticParams() {
  return SOURCE_SLUGS.map((source) => ({ source }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  return { title: isSourceSlug(source) ? SOURCES[source].titolo : "Importa" };
}

export default async function ImportSourcePage({
  params,
}: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  if (!isSourceSlug(source)) notFound();
  const meta = SOURCES[source];

  return (
    <main className="relative px-5 pb-[150px] lg:px-10 lg:pb-36">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-[140px] -top-[180px] h-[380px] w-[460px] rounded-full blur-[44px]"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.32) 0%, rgba(139,92,246,0.08) 45%, rgba(0,0,0,0) 70%)",
        }}
      />
      <header className="relative flex items-center gap-3.5 pt-[calc(env(safe-area-inset-top,0px)+var(--nav-top)+32px)]">
        <BackButton inline />
        <div className="flex min-w-0 flex-col gap-1">
          <Link
            data-crumb
            href="/import"
            className="text-[13px] font-medium text-accent-soft"
          >
            Importa
          </Link>
          <h1 className="text-[28px] font-bold leading-none tracking-[-0.045em]">
            {meta.titolo}
          </h1>
        </div>
      </header>
      <div className="relative mt-7 lg:max-w-[720px]">
        <ImportClient source={meta} />
      </div>
    </main>
  );
}

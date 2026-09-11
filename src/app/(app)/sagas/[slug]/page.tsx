import Image from "next/image";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { SagaProgress } from "@/components/sagas/SagaProgress";
import { getSaga } from "@/lib/sagas/catalog";
import { backdropUrl } from "@/lib/config";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const saga = getSaga((await params).slug);
  return { title: saga?.title ?? "Saga non trovata" };
}

export default async function SagaPage({ params }: Props) {
  const saga = getSaga((await params).slug);
  if (!saga) notFound();
  const cover = saga.movies.find((movie) => movie.id === saga.coverId);
  const image = backdropUrl(cover?.backdropPath ?? null, "original");
  return (
    <>
      <TopBar
        title={saga.title}
        back
        parent={{ label: "Saghe e universi", href: "/sagas" }}
      />
      <main className="pb-16">
        <div className="relative isolate overflow-hidden">
          {image && (
            <Image
              src={image}
              alt=""
              fill
              priority
              unoptimized
              className="object-cover object-center"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-bg via-black/70 to-black/25" />
          <div className="relative px-5 pb-7 pt-24 lg:px-10 lg:pb-10 lg:pt-40">
            <p className="mb-2 text-sm font-medium text-accent-pale">{saga.subtitle}</p>
            <h2 className="text-4xl font-bold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              {saga.title}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/80">
              {saga.description}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="text-muted">{saga.movies.length} film</span>
              <a
                href={saga.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-soft underline underline-offset-4"
              >
                {saga.source.label}
              </a>
            </div>
          </div>
        </div>
        <div className="px-5 lg:px-10">
          <Suspense
            fallback={
              <p role="status" className="py-8 text-muted">
                Caricamento del tuo percorso…
              </p>
            }
          >
            <SagaProgress saga={saga} />
          </Suspense>
        </div>
      </main>
    </>
  );
}

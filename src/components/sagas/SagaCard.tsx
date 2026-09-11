import Image from "next/image";
import Link from "next/link";
import { backdropUrl } from "@/lib/config";
import type { Saga } from "@/lib/sagas/order";

export function SagaCard({ saga, shelf = false }: { saga: Saga; shelf?: boolean }) {
  const cover = saga.movies.find((movie) => movie.id === saga.coverId);
  const image = backdropUrl(cover?.backdropPath ?? null, "original");
  return (
    <Link
      href={`/sagas/${saga.slug}`}
      className={`group relative isolate block aspect-[16/10] overflow-hidden rounded-[20px] bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent ${shelf ? "w-[300px] shrink-0 md:w-[352px] lg:w-[420px]" : "w-full"}`}
    >
      {image && (
        <Image
          src={image}
          alt=""
          fill
          unoptimized
          className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10" />
      <div className="relative flex h-full flex-col justify-between p-5 lg:p-6">
        <span className="glass w-fit rounded-full px-3 py-1 text-xs font-medium">
          {saga.movies.length} film
        </span>
        <div>
          <h3 className="text-2xl font-bold leading-tight tracking-[-0.035em] lg:text-3xl">
            {saga.title}
          </h3>
          <p className="mt-1 text-sm text-white/75">{saga.subtitle}</p>
          <p className="mt-3 text-xs font-medium text-accent-pale">
            {saga.actors ? "Per uscita o interprete" : "Per uscita o linea temporale"}
          </p>
        </div>
      </div>
    </Link>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTitleCached } from "@/lib/tmdb/get-title";
import { posterUrl } from "@/lib/config";
import { TitleBody } from "@/components/title/TitleBody";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ day?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return {};
  const cached = await getTitleCached(numId, "movie", true);
  if (!cached) return {};
  const poster = posterUrl(cached.title.poster_path, "w500");
  return {
    title: cached.title.title,
    openGraph: {
      title: cached.title.title,
      description: cached.title.overview ?? undefined,
      images: poster ? [poster] : undefined,
    },
  };
}

export default async function MovieTitlePage({ params, searchParams }: Props) {
  const { id } = await params;
  const { day } = await searchParams;
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) notFound();

  const cached = await getTitleCached(numId, "movie", true);
  if (!cached) notFound();

  return <TitleBody cached={cached} day={day} />;
}

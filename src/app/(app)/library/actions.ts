"use server";

import { getLibraryPage, type LibraryItem } from "@/lib/watch/queries";
import type { Enums } from "@/types/database";
import { LIBRARY_PAGE_SIZE } from "./limits";

/** Pagina successiva della libreria (bottone "Carica altri"). */
export async function loadMoreLibrary(
  status: Enums<"watch_status">,
  mediaType: "movie" | "tv" | null,
  offset: number,
): Promise<LibraryItem[]> {
  const { items } = await getLibraryPage(status, mediaType, offset, LIBRARY_PAGE_SIZE);
  return items;
}

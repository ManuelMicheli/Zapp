import "server-only";

import { cache } from "react";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

export type ListRole = "owner" | "viewer" | "editor";
export type ListDefaultRole = "viewer" | "editor";

export interface TitleListSummary {
  id: string;
  name: string;
  description: string | null;
  /** Permesso che prendono i nuovi invitati: lo cambia solo il proprietario. */
  defaultRole: ListDefaultRole;
  ownerId: string;
  role: ListRole;
  itemCount: number;
  updatedAt: string;
}

export interface TitleListItem {
  id: string;
  titleId: number;
  mediaType: "movie" | "tv";
  name: string;
  posterPath: string | null;
  year: number | null;
  addedBy: string;
}

export interface TitleListMember {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: ListRole;
}

export interface TitleListDetail extends TitleListSummary {
  members: TitleListMember[];
  items: TitleListItem[];
}

function yearFromDate(value: string | null): number | null {
  if (!value || !/^\d{4}/.test(value)) return null;
  return Number(value.slice(0, 4));
}

export const getMyLists = cache(async (): Promise<TitleListSummary[]> => {
  const viewer = await getViewer();
  if (!viewer) return [];
  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("title_list_members")
    .select("list_id, role")
    .eq("user_id", viewer.id);
  const ids = (memberships ?? []).map((row) => row.list_id);
  if (ids.length === 0) return [];
  const { data: lists } = await supabase
    .from("title_lists")
    .select("id, name, description, default_role, owner_id, updated_at")
    .in("id", ids)
    .order("updated_at", { ascending: false });
  const counts = new Map<string, number>();
  const { data: items } = await supabase
    .from("title_list_items")
    .select("list_id")
    .in("list_id", ids);
  for (const item of items ?? [])
    counts.set(item.list_id, (counts.get(item.list_id) ?? 0) + 1);
  const roles = new Map(memberships?.map((row) => [row.list_id, row.role as ListRole]));
  return (lists ?? []).map((list) => ({
    id: list.id,
    name: list.name,
    description: list.description,
    defaultRole: (list.default_role === "editor" ? "editor" : "viewer") as ListDefaultRole,
    ownerId: list.owner_id,
    role: roles.get(list.id) ?? "viewer",
    itemCount: counts.get(list.id) ?? 0,
    updatedAt: list.updated_at,
  }));
});

export async function getList(id: string): Promise<TitleListDetail | null> {
  const supabase = await createClient();
  const { data: list } = await supabase
    .from("title_lists")
    .select("id, name, description, default_role, owner_id, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!list) return null;
  const [{ data: memberships }, { data: items }] = await Promise.all([
    supabase.from("title_list_members").select("user_id, role").eq("list_id", id),
    supabase
      .from("title_list_items")
      .select("id, title_id, media_type, added_by")
      .eq("list_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const memberIds = (memberships ?? []).map((row) => row.user_id);
  const titleKeys = (items ?? []).map((row) => ({
    id: row.title_id,
    type: row.media_type,
  }));
  const [{ data: profiles }, { data: titles }] = await Promise.all([
    memberIds.length
      ? supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", memberIds)
      : Promise.resolve({ data: [] }),
    titleKeys.length
      ? supabase
          .from("titles")
          .select("id, media_type, title, poster_path, release_date")
          .in(
            "id",
            titleKeys.map((key) => key.id),
          )
      : Promise.resolve({ data: [] }),
  ]);
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const titleMap = new Map(
    (titles ?? []).map((title) => [`${title.media_type}:${title.id}`, title]),
  );
  const viewer = await getViewer();
  const ownMembership = memberships?.find((member) => member.user_id === viewer?.id);
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    defaultRole: (list.default_role === "editor" ? "editor" : "viewer") as ListDefaultRole,
    ownerId: list.owner_id,
    role: (ownMembership?.role as ListRole | undefined) ?? "viewer",
    itemCount: items?.length ?? 0,
    updatedAt: list.updated_at,
    members: (memberships ?? []).flatMap((member) => {
      const profile = profileMap.get(member.user_id);
      return profile
        ? [
            {
              userId: member.user_id,
              username: profile.username,
              displayName: profile.display_name,
              avatarUrl: profile.avatar_url,
              role: member.role as ListRole,
            },
          ]
        : [];
    }),
    items: (items ?? []).flatMap((item) => {
      const title = titleMap.get(`${item.media_type}:${item.title_id}`);
      return title
        ? [
            {
              id: item.id,
              titleId: item.title_id,
              mediaType: item.media_type,
              name: title.title,
              posterPath: title.poster_path,
              year: yearFromDate(title.release_date),
              addedBy: item.added_by,
            },
          ]
        : [];
    }),
  };
}

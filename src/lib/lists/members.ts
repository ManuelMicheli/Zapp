export type InitialMemberRole = "viewer" | "editor";

export interface InitialMemberSelection {
  userId: string;
  role: InitialMemberRole;
}

/** Normalizza la selezione del form prima delle chiamate di invito. */
export function selectedMemberRoles(
  selections: InitialMemberSelection[],
): InitialMemberSelection[] {
  const unique = new Map<string, InitialMemberSelection>();
  for (const selection of selections) unique.set(selection.userId, selection);
  return [...unique.values()];
}

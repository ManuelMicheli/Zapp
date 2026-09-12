import { describe, expect, it } from "vitest";
import { selectedMemberRoles } from "./members";

describe("selected shared-list members", () => {
  it("keeps one explicit role per selected friend", () => {
    expect(
      selectedMemberRoles([
        { userId: "friendA", role: "viewer" },
        { userId: "friendB", role: "editor" },
        { userId: "friendA", role: "editor" },
      ]),
    ).toEqual([
      { userId: "friendA", role: "editor" },
      { userId: "friendB", role: "editor" },
    ]);
  });
});

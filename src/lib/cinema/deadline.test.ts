import { describe, expect, it } from "vitest";
import { withDeadline } from "./deadline";

const after = <T>(ms: number, value: T) =>
  new Promise<T>((r) => setTimeout(() => r(value), ms));

describe("withDeadline", () => {
  it("dà il risultato se arriva in tempo", async () => {
    await expect(withDeadline(after(5, "ok"), 200, "tardi")).resolves.toBe("ok");
  });

  it("dà il ripiego se il lavoro è troppo lento", async () => {
    await expect(withDeadline(after(200, "ok"), 5, "tardi")).resolves.toBe("tardi");
  });

  it("dà il ripiego se il lavoro fallisce", async () => {
    await expect(
      withDeadline(Promise.reject(new Error("giù")), 200, "tardi"),
    ).resolves.toBe("tardi");
  });
});

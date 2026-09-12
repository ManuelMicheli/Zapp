import { describe, expect, it } from "vitest";

import {
  createRecommendationToken,
  hashRecommendationToken,
  isRecommendationToken,
} from "./link";

describe("recommendation link tokens", () => {
  it("creates a cryptographically shaped token and a stable one-way hash", () => {
    const token = createRecommendationToken();

    expect(isRecommendationToken(token)).toBe(true);
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(hashRecommendationToken(token)).toBe(hashRecommendationToken(token));
    expect(hashRecommendationToken(token)).not.toBe(token);
  });

  it("rejects malformed tokens", () => {
    expect(isRecommendationToken("short")).toBe(false);
    expect(isRecommendationToken("token with spaces")).toBe(false);
    expect(isRecommendationToken("a".repeat(200))).toBe(false);
  });
});

import { createHash, randomBytes } from "node:crypto";

const TOKEN_LENGTH = 43;

export function createRecommendationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashRecommendationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isRecommendationToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(value) &&
    value.length === TOKEN_LENGTH
  );
}

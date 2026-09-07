import crypto from "node:crypto";

// Verification/reset tokens: the raw token is only ever emailed to the
// user and never persisted; the database stores only its hash, so a
// database leak alone cannot be used to complete verification/reset
// (SECURITY.md §1, DATABASE.md "Identity & access").
export function generateRawToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

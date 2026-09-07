import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

describe("password hashing (ADR-003: Argon2id)", () => {
  it("hashes with argon2id and verifies the correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      verifyPassword(hash, "correct horse battery staple"),
    ).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword(hash, "wrong password")).resolves.toBe(false);
  });

  it("fails closed on a malformed hash instead of throwing", async () => {
    await expect(verifyPassword("not-a-real-hash", "anything")).resolves.toBe(
      false,
    );
  });
});

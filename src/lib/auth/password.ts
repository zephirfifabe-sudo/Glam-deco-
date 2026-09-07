import * as argon2 from "argon2";

// Argon2id - current OWASP recommendation, memory-hard (ADR-003).
// Never bcrypt/md5/sha1 for passwords, never plaintext (brief §15).
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    // A malformed/foreign hash must fail closed, not throw past the
    // caller and risk being treated as "authenticated".
    return false;
  }
}

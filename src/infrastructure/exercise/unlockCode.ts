import { createHash, randomBytes } from 'node:crypto';

/**
 * Unlock-code hashing. The exercise YAML stores only a salted SHA-256 hash of the code, never the
 * plaintext: the repo is public on GitHub, so a plaintext code could simply be looked up there.
 * The trainer keeps the plaintext codes and announces them; the app hashes the typed code and
 * compares. (This gates the PACE, not the answers — solutions already live in the exercise hints —
 * so a non-trivial code is enough; trivial codes would be brute-forceable.)
 *
 * Codes are matched after trimming and lower-casing so live typos / Caps Lock don't block a learner.
 * The generator (scripts/gen-unlock.ts) and the verifier must apply the SAME normalization.
 */

export interface UnlockHash {
  /** Random per-exercise salt (hex) — defeats rainbow tables and hides shared codes. */
  readonly salt: string;
  /** sha256(`${salt}:${normalized code}`) as hex. */
  readonly hash: string;
}

const normalize = (code: string): string => code.trim().toLowerCase();

export function hashUnlockCode(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${normalize(code)}`).digest('hex');
}

/** Build a fresh {salt, hash} for a plaintext code (used by the authoring script). */
export function makeUnlock(code: string): UnlockHash {
  const salt = randomBytes(8).toString('hex');
  return { salt, hash: hashUnlockCode(code, salt) };
}

/** True when `code` hashes (with the stored salt) to the stored hash. Empty input never matches. */
export function verifyUnlock(code: string, unlock: UnlockHash): boolean {
  if (!code.trim()) return false;
  return hashUnlockCode(code, unlock.salt) === unlock.hash;
}
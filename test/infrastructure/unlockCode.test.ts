import { describe, expect, it } from 'vitest';
import { makeUnlock, verifyUnlock, hashUnlockCode } from '../../src/infrastructure/exercise/unlockCode';

describe('unlockCode', () => {
  it('round-trips: a freshly made hash verifies for the same code', () => {
    const u = makeUnlock('Delta-Anker-37');
    expect(verifyUnlock('Delta-Anker-37', u)).toBe(true);
  });

  it('matches case-insensitively and trims surrounding whitespace', () => {
    const u = makeUnlock('Geheim-42');
    expect(verifyUnlock('  geheim-42  ', u)).toBe(true);
    expect(verifyUnlock('GEHEIM-42', u)).toBe(true);
  });

  it('rejects a wrong or empty code', () => {
    const u = makeUnlock('richtig');
    expect(verifyUnlock('falsch', u)).toBe(false);
    expect(verifyUnlock('', u)).toBe(false);
    expect(verifyUnlock('   ', u)).toBe(false);
  });

  it('uses a fresh salt each time, so the same code yields different hashes', () => {
    const a = makeUnlock('same');
    const b = makeUnlock('same');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('hashUnlockCode is a 64-char hex digest and deterministic for a fixed salt', () => {
    const h = hashUnlockCode('code', 'abcd');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashUnlockCode('CODE', 'abcd')).toBe(h); // normalization (lowercase) applied
  });
});
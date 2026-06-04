import { describe, expect, it } from 'vitest';
import { copyTargets, copyAll } from '../../src/electron/renderer-graph/copy';
import type { CommitDetail } from '../../src/core/graph/GraphLayout';

/** Stub date formatter so copyAll's output is deterministic without pulling in graph.ts. */
const fmt = (sec: number, tz: string) => `D(${sec},${tz})`;

function mk(overrides: Partial<CommitDetail> = {}): CommitDetail {
  return {
    oid: 'abc123def456abc123def456abc123def456abcd',
    author: { name: 'Ada Lovelace', email: 'ada@example.org', date: 1000, tz: '+0200' },
    committer: { name: 'Grace Hopper', email: 'grace@example.org', date: 2000, tz: '-0500' },
    message: 'Erste Zeile\n\nMehr Text',
    ...overrides,
  };
}

describe('copyTargets', () => {
  it('exposes oid, message and "Name <email>" for author and committer', () => {
    const t = new Map(copyTargets(mk()).map((x) => [x.key, x.value]));
    expect(t.get('sha')).toBe('abc123def456abc123def456abc123def456abcd');
    expect(t.get('message')).toBe('Erste Zeile\n\nMehr Text');
    expect(t.get('author')).toBe('Ada Lovelace <ada@example.org>');
    expect(t.get('committer')).toBe('Grace Hopper <grace@example.org>');
  });

  it('falls back to just the name when no email is recorded', () => {
    const t = copyTargets(mk({ author: { name: 'Nemo', email: '', date: 1, tz: '+0000' } }));
    expect(t.find((x) => x.key === 'author')!.value).toBe('Nemo');
  });

  it('gives every target a non-empty German action label', () => {
    for (const x of copyTargets(mk())) expect(x.label.length).toBeGreaterThan(0);
  });
});

describe('copyAll', () => {
  it('formats all fields as one block, using the injected date formatter', () => {
    const block = copyAll(mk(), fmt);
    expect(block).toContain('SHA: abc123def456abc123def456abc123def456abcd');
    expect(block).toContain('Autor: Ada Lovelace <ada@example.org>');
    expect(block).toContain('Autor-Datum: D(1000,+0200)');
    expect(block).toContain('Committer: Grace Hopper <grace@example.org>');
    expect(block).toContain('Committer-Datum: D(2000,-0500)');
    expect(block).toContain('Erste Zeile\n\nMehr Text');
  });
});
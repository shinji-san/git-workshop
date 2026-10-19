import { describe, expect, it } from 'vitest';
import { Assertion } from '../../src/core/domain/Assertion';
import { describeAssertion } from '../../src/core/i18n/assertionMessages';
import { UI_LOCALES } from '../../src/core/i18n/Locale';

/** One sample per assertion type – the mapped type already guarantees catalog completeness at compile time. */
const samples: Assertion[] = [
  { type: 'branchExists', name: 'feature' },
  { type: 'headOnBranch', name: 'main' },
  { type: 'headDetached' },
  { type: 'repoInitialized' },
  { type: 'headUnborn' },
  { type: 'headUnborn', branch: 'main' },
  { type: 'commitExists', summary: 'Init', reachableFrom: 'main' },
  { type: 'tipHasParents', branch: 'main', count: 2 },
  { type: 'branchAhead', branch: 'main', base: 'feature', by: 1 },
  { type: 'commitCount', ref: 'main', count: 3 },
  { type: 'tagExists', name: 'v1' },
  { type: 'danglingCommitExists', summary: 'Lost' },
  { type: 'noDanglingCommits' },
  { type: 'fileStaged', path: 'a.txt' },
  { type: 'fileInWorktree', path: 'a.txt' },
  { type: 'gitConfig', key: 'user.name', value: 'Ada' },
  { type: 'gitConfig', key: 'user.name' },
  { type: 'gitCommandUsed', name: ['show', 'log'] },
  { type: 'gitCommandUsed', name: 'hash-object', argsContain: ['-w'] },
  { type: 'objectExists', kind: 'blob' },
  { type: 'indexEntry', path: 'a.txt' },
];

describe('describeAssertion', () => {
  it('yields a non-empty text for every assertion in every UI locale', () => {
    for (const locale of UI_LOCALES) for (const a of samples) expect(describeAssertion(a, locale).length).toBeGreaterThan(0);
  });

  it('speaks the requested language', () => {
    expect(describeAssertion({ type: 'branchExists', name: 'feature' }, 'de-DE')).toBe('Branch feature existiert');
    expect(describeAssertion({ type: 'branchExists', name: 'feature' }, 'en-US')).toBe('branch feature exists');
    expect(describeAssertion({ type: 'gitCommandUsed', name: ['show', 'log'] }, 'de-DE')).toContain('show oder log');
    expect(describeAssertion({ type: 'gitCommandUsed', name: ['show', 'log'] }, 'en-US')).toContain('show or log');
  });

  it('falls back to the closest UI locale for other tags', () => {
    expect(describeAssertion({ type: 'headDetached' }, 'en-GB')).toBe('HEAD is detached');
    expect(describeAssertion({ type: 'headDetached' }, 'fr-FR')).toBe('HEAD ist detached'); // default: de-DE
  });
});

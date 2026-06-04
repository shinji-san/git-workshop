import { describe, expect, it } from 'vitest';
import { CommitNode, RepoState } from '../../src/core/domain/RepoState';
import { evaluate } from '../../src/core/validation/evaluators';
import { evaluateStep, matchPitfalls } from '../../src/core/validation/evaluateStep';

// Commit factory: fills the display-only signature/message fields (irrelevant to evaluators).
const c = (oid: string, parents: string[], summary: string, date: number, reachable: boolean): CommitNode => ({
  oid,
  parents,
  summary,
  reachable,
  author: { name: 'A', email: 'a@x', date, tz: '+0000' },
  committer: { name: 'C', email: 'c@x', date, tz: '+0000' },
  message: summary,
});

// Diamond: r <- a, r <- b, merge m (parents a,b). main points at m, feature at b.
// dangling d is unreachable.
const state: RepoState = {
  commits: [
    c('m', ['a', 'b'], 'Merge feature', 50, true),
    c('a', ['r'], 'Work on main', 40, true),
    c('b', ['r'], 'Add feature', 30, true),
    c('r', [], 'Init', 10, true),
    c('d', ['r'], 'Lost work', 35, false),
  ],
  refs: [
    { name: 'main', fullName: 'refs/heads/main', kind: 'branch', oid: 'm' },
    { name: 'feature', fullName: 'refs/heads/feature', kind: 'branch', oid: 'b' },
    { name: 'v1.0', fullName: 'refs/tags/v1.0', kind: 'tag', oid: 'm' },
  ],
  head: { kind: 'attached', branch: 'main', oid: 'm' },
  worktree: [{ path: 'README.md', staged: true, modified: false, untracked: false }],
  config: { 'user.name': 'Max Mustermann', 'user.email': 'max@x.de', 'init.defaultbranch': 'main' },
  objects: [
    { oid: 'm', kind: 'commit' },
    { oid: 'blob1', kind: 'blob' },
    { oid: 'tree1', kind: 'tree' },
  ],
  index: [{ mode: '100644', oid: 'blob1', path: 'README.md' }],
  commands: [
    { name: 'hash-object', argv: ['git', 'hash-object', '-w', 'brief.txt'], exitCode: 0 },
    { name: 'cat-file', argv: ['git', 'cat-file', '-p', 'HEAD'], exitCode: 0 },
    // A FAILED invocation (e.g. a bogus OID) – must not satisfy gitCommandUsed.
    { name: 'cat-file', argv: ['git', 'cat-file', '-p', 'deadbeef'], exitCode: 128 },
    // A command that was ONLY ever run unsuccessfully – must not count.
    { name: 'merge', argv: ['git', 'merge', 'feature'], exitCode: 1 },
  ],
};

const p = (a: Parameters<typeof evaluate>[1]) => evaluate(state, a).passed;

describe('evaluators', () => {
  it('branchExists / headOnBranch / headDetached', () => {
    expect(p({ type: 'branchExists', name: 'feature' })).toBe(true);
    expect(p({ type: 'branchExists', name: 'nope' })).toBe(false);
    expect(p({ type: 'headOnBranch', name: 'main' })).toBe(true);
    expect(p({ type: 'headDetached' })).toBe(false);
  });

  it('tipHasParents detects a merge', () => {
    expect(p({ type: 'tipHasParents', branch: 'main', count: 2 })).toBe(true);
    expect(p({ type: 'tipHasParents', branch: 'feature', count: 2 })).toBe(false);
  });

  it('commitExists with reachableFrom', () => {
    expect(p({ type: 'commitExists', summary: 'Add feature', reachableFrom: 'main' })).toBe(true);
    expect(p({ type: 'commitExists', summary: 'Lost work', reachableFrom: 'main' })).toBe(false);
    // Fail closed: a missing ref (e.g. origin/main before a push) matches nothing.
    expect(p({ type: 'commitExists', summary: 'Add feature', reachableFrom: 'origin/main' })).toBe(false);
  });

  it('commitCount counts ancestors', () => {
    expect(p({ type: 'commitCount', ref: 'main', count: 4 })).toBe(true); // m,a,b,r
    expect(p({ type: 'commitCount', ref: 'feature', count: 2 })).toBe(true); // b,r
  });

  it('branchAhead', () => {
    expect(p({ type: 'branchAhead', branch: 'main', base: 'feature', by: 2 })).toBe(true); // m,a
  });

  it('tagExists', () => {
    expect(p({ type: 'tagExists', name: 'v1.0', on: 'main' })).toBe(true);
    expect(p({ type: 'tagExists', name: 'v1.0', on: 'feature' })).toBe(false);
  });

  it('danglingCommitExists finds an orphaned commit', () => {
    expect(p({ type: 'danglingCommitExists', summary: 'Lost work' })).toBe(true);
    expect(p({ type: 'danglingCommitExists', summary: 'Add feature' })).toBe(false);
  });

  it('noDanglingCommits: false with an orphan present, true when all are reachable', () => {
    expect(p({ type: 'noDanglingCommits' })).toBe(false); // 'd' (Lost work) is unreachable
    const clean: RepoState = { ...state, commits: state.commits.filter((c) => c.reachable) };
    expect(evaluate(clean, { type: 'noDanglingCommits' }).passed).toBe(true);
  });

  it('fileStaged / fileInWorktree', () => {
    expect(p({ type: 'fileStaged', path: 'README.md' })).toBe(true);
    expect(p({ type: 'fileInWorktree', path: 'README.md' })).toBe(true);
  });

  it('gitConfig checks value, mere presence and key case-insensitivity', () => {
    expect(p({ type: 'gitConfig', key: 'user.email', value: 'max@x.de' })).toBe(true);
    expect(p({ type: 'gitConfig', key: 'user.email', value: 'falsch@x.de' })).toBe(false);
    expect(p({ type: 'gitConfig', key: 'user.name' })).toBe(true); // without value: just set?
    expect(p({ type: 'gitConfig', key: 'commit.gpgsign' })).toBe(false); // not set
    expect(p({ type: 'gitConfig', key: 'init.defaultBranch', value: 'main' })).toBe(true); // key case
  });

  it('evaluateStep UND-Semantik', () => {
    const v = evaluateStep(state, [
      { type: 'headOnBranch', name: 'main' },
      { type: 'tipHasParents', branch: 'main', count: 2 },
    ]);
    expect(v.satisfied).toBe(true);
    expect(v.results).toHaveLength(2);
  });

  it('matchPitfalls fires when the affirmative condition holds', () => {
    const matched = matchPitfalls(state, [
      { id: 'x', when: [{ type: 'tipHasParents', branch: 'main', count: 2 }], severity: 'info', message: 'hit' },
      { id: 'y', when: [{ type: 'headDetached' }], severity: 'info', message: 'miss' },
    ]);
    expect(matched.map((m) => m.id)).toEqual(['x']);
  });
});

describe('repoInitialized / headUnborn', () => {
  const base = { commits: [], refs: [], worktree: [], config: {}, objects: [], index: [], commands: [] } as const;
  const at = (head: RepoState['head']): RepoState => ({ ...base, head });

  it('"none" (not a repo): both false', () => {
    const s = at({ kind: 'none' });
    expect(evaluate(s, { type: 'repoInitialized' }).passed).toBe(false);
    expect(evaluate(s, { type: 'headUnborn' }).passed).toBe(false);
  });

  it('"unborn" (initialized, no commit): both true; optional branch is checked', () => {
    const s = at({ kind: 'unborn', branch: 'main' });
    expect(evaluate(s, { type: 'repoInitialized' }).passed).toBe(true);
    expect(evaluate(s, { type: 'headUnborn' }).passed).toBe(true);
    expect(evaluate(s, { type: 'headUnborn', branch: 'main' }).passed).toBe(true);
    expect(evaluate(s, { type: 'headUnborn', branch: 'dev' }).passed).toBe(false);
  });

  it('"attached" (has a commit): initialized but no longer unborn', () => {
    const s = at({ kind: 'attached', branch: 'main', oid: 'a' });
    expect(evaluate(s, { type: 'repoInitialized' }).passed).toBe(true);
    expect(evaluate(s, { type: 'headUnborn' }).passed).toBe(false);
  });
});

describe('plumbing checks (gitCommandUsed / objectExists / indexEntry)', () => {
  it('gitCommandUsed matches by name and (optionally) all argsContain tokens', () => {
    expect(p({ type: 'gitCommandUsed', name: 'hash-object' })).toBe(true);
    expect(p({ type: 'gitCommandUsed', name: 'hash-object', argsContain: ['-w'] })).toBe(true);
    expect(p({ type: 'gitCommandUsed', name: 'hash-object', argsContain: ['-w', 'brief.txt'] })).toBe(true);
    expect(p({ type: 'gitCommandUsed', name: 'cat-file', argsContain: ['-p'] })).toBe(true);
    // wrong arg / wrong name -> no match
    expect(p({ type: 'gitCommandUsed', name: 'hash-object', argsContain: ['--stdin'] })).toBe(false);
    expect(p({ type: 'gitCommandUsed', name: 'write-tree' })).toBe(false);
  });

  it('gitCommandUsed requires a SUCCESSFUL run (exit 0)', () => {
    // cat-file succeeded once (-p HEAD) and failed once (-p deadbeef): the success matches,
    // but a token only present in the FAILED run must not satisfy the goal.
    expect(p({ type: 'gitCommandUsed', name: 'cat-file', argsContain: ['deadbeef'] })).toBe(false);
    // merge was only ever run unsuccessfully -> no match at all.
    expect(p({ type: 'gitCommandUsed', name: 'merge' })).toBe(false);
  });

  it('gitCommandUsed with a name LIST matches on any one (OR)', () => {
    // cat-file is in the list -> match; show/log alone are not present -> no match.
    expect(p({ type: 'gitCommandUsed', name: ['show', 'cat-file'] })).toBe(true);
    expect(p({ type: 'gitCommandUsed', name: ['show', 'log'] })).toBe(false);
    // the OR still respects exit 0: merge only failed, so a list of only-failed names misses.
    expect(p({ type: 'gitCommandUsed', name: ['merge'] })).toBe(false);
  });

  it('objectExists checks the object database by kind', () => {
    expect(p({ type: 'objectExists', kind: 'blob' })).toBe(true);
    expect(p({ type: 'objectExists', kind: 'tree' })).toBe(true);
    expect(p({ type: 'objectExists', kind: 'commit' })).toBe(true);
    expect(p({ type: 'objectExists', kind: 'tag' })).toBe(false);
  });

  it('indexEntry checks the staging area by path', () => {
    expect(p({ type: 'indexEntry', path: 'README.md' })).toBe(true);
    expect(p({ type: 'indexEntry', path: 'nope.txt' })).toBe(false);
  });
});

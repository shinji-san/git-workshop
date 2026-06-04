/**
 * Declarative goal description as a discriminated union – pure data, no logic.
 *
 * Core design rule: commits are NEVER referenced by their OID (hashes are
 * non-deterministic) but structurally (parent count, ahead/behind, reachability)
 * or via their message (`summary`).
 *
 * A new check = a new union member + an evaluator in core/validation.
 */
export type Assertion =
  | { type: 'branchExists'; name: string }
  | { type: 'headOnBranch'; name: string }
  | { type: 'headDetached' }
  /** A git repository exists (anything other than "not a repo"). */
  | { type: 'repoInitialized' }
  /** Freshly initialized: HEAD on a branch with no commit yet (optionally a named branch). */
  | { type: 'headUnborn'; branch?: string }
  | { type: 'commitExists'; summary: string; reachableFrom?: string }
  | { type: 'tipHasParents'; branch: string; count: number }
  | { type: 'branchAhead'; branch: string; base: string; by: number }
  | { type: 'commitCount'; ref: string; count: number }
  | { type: 'tagExists'; name: string; on?: string }
  | { type: 'danglingCommitExists'; summary?: string }
  /** No unreachable (orphaned) commits exist at all – e.g. after `git gc --prune=now`. */
  | { type: 'noDanglingCommits' }
  | { type: 'fileStaged'; path: string }
  | { type: 'fileInWorktree'; path: string }
  /** Checks the effective git config. Without `value`: the key is set (non-empty);
   *  with `value`: exact equality. Keys are case-insensitive. */
  | { type: 'gitConfig'; key: string; value?: string }
  /**
   * A git command was run in the interactive shell this attempt (plumbing check B).
   * `name` is a subcommand or a LIST of subcommands (match on any one – an OR, e.g.
   * `['show', 'log']`). `argsContain` (optional) requires all listed tokens to appear in
   * the argv, e.g. `{ name: 'hash-object', argsContain: ['-w'] }`. Verifies even read-only
   * commands.
   */
  | { type: 'gitCommandUsed'; name: string | readonly string[]; argsContain?: readonly string[] }
  /** An object of the given kind exists in the database (plumbing outcome, e.g. a written blob). */
  | { type: 'objectExists'; kind: 'blob' | 'tree' | 'commit' | 'tag' }
  /** The staging area has an entry for the given path (e.g. after `update-index`/`add`). */
  | { type: 'indexEntry'; path: string };

export type AssertionType = Assertion['type'];

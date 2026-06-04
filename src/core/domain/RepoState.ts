/**
 * Pure data structures describing a Git repository state.
 *
 * These structures know nothing about Git, Node or Electron. The `GitInspector`
 * (infrastructure) builds them from plumbing output; validation and graph layout
 * consume them as pure functions. Note: `commits` ALSO contains unreachable
 * (orphaned) commits, so orphan checks and the disconnected graph work.
 */

/** Author/committer line of a commit object: identity + the original authored timestamp. */
export interface CommitSignature {
  readonly name: string;
  readonly email: string;
  /** Unix seconds. */
  readonly date: number;
  /** Original timezone offset as recorded, e.g. "+0200" (for faithful, git-show-style display). */
  readonly tz: string;
}

export interface CommitNode {
  readonly oid: string;
  /** Parent OIDs; edge child -> parent. Merge commits have >= 2 parents. */
  readonly parents: readonly string[];
  /** First line of the commit message. */
  readonly summary: string;
  /** false = unreachable from any ref (orphaned/dangling). */
  readonly reachable: boolean;
  /** Full author signature (committer.date is the tiebreaker for topological sorting). */
  readonly author: CommitSignature;
  readonly committer: CommitSignature;
  /** Full commit message (all lines, trailing newline trimmed). */
  readonly message: string;
}

export type RefKind = 'branch' | 'tag' | 'remote';

export interface Ref {
  /** Short name, e.g. "feature" or "v1.0". */
  readonly name: string;
  /** Fully qualified, e.g. "refs/heads/feature". */
  readonly fullName: string;
  readonly kind: RefKind;
  /** The commit this ref points to (annotated tags are dereferenced to their target). */
  readonly oid: string;
}

export type HeadState =
  | { readonly kind: 'attached'; readonly branch: string; readonly oid: string }
  | { readonly kind: 'detached'; readonly oid: string }
  /** Fresh repo: HEAD points at a branch that has no commit yet. */
  | { readonly kind: 'unborn'; readonly branch: string }
  /** Not a git repository (yet): the directory exists but `git init` has not run. */
  | { readonly kind: 'none' };

export interface WorktreeFile {
  readonly path: string;
  readonly staged: boolean;
  readonly modified: boolean;
  readonly untracked: boolean;
}

export type GitObjectKind = 'blob' | 'tree' | 'commit' | 'tag';

/** A raw object in the database (from `cat-file --batch-all-objects`). */
export interface GitObject {
  readonly oid: string;
  readonly kind: GitObjectKind;
}

/** A staged entry (from `git ls-files --stage`): mode, blob OID and path. */
export interface IndexEntry {
  readonly mode: string;
  readonly oid: string;
  readonly path: string;
}

/** A git command observed in the interactive shell this attempt (from GIT_TRACE2). */
export interface GitCommand {
  /** Canonical subcommand, e.g. "cat-file", "hash-object". */
  readonly name: string;
  /** Full argument vector as invoked, e.g. ["git", "cat-file", "-p", "HEAD"]. */
  readonly argv: readonly string[];
  /** Process exit code (0 = success). Undefined if the trace had no exit event yet. */
  readonly exitCode?: number;
}

export interface RepoState {
  readonly commits: readonly CommitNode[];
  readonly refs: readonly Ref[];
  readonly head: HeadState;
  readonly worktree: readonly WorktreeFile[];
  /**
   * Effective git config (global+local merged) of the sandbox. Keys lowercased
   * (as git emits them, e.g. `user.name`, `init.defaultbranch`); last value wins.
   * Lets exercises check that configuration was set correctly.
   */
  readonly config: { readonly [key: string]: string };
  /** All objects in the database (enables plumbing "outcome" checks, e.g. a blob was written). */
  readonly objects: readonly GitObject[];
  /** The staging area (enables checks for `update-index`/`add` outcomes by path). */
  readonly index: readonly IndexEntry[];
  /**
   * Git commands the participant ran in the interactive shell during this attempt
   * (captured via GIT_TRACE2). Enables checking *which* command was used – the only
   * way to verify read-only plumbing (`cat-file -p`, `ls-files`, …) that leaves no state.
   */
  readonly commands: readonly GitCommand[];
}

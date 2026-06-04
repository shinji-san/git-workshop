import { Assertion, AssertionType } from '../domain/Assertion';
import { RepoState } from '../domain/RepoState';
import { AssertionResult } from '../domain/Verdict';
import { ancestors, refOid } from './graph-utils';

type Of<K extends AssertionType> = Extract<Assertion, { type: K }>;
type Evaluator<K extends AssertionType> = (state: RepoState, a: Of<K>) => boolean;

const r = (assertion: Assertion, passed: boolean, detail: string): AssertionResult => ({
  assertion,
  passed,
  detail,
});

/**
 * One evaluator per assertion type. The mapped type enforces completeness:
 * if a type is missing this object does not compile (open/closed for new checks).
 */
const predicates: { [K in AssertionType]: Evaluator<K> } = {
  branchExists: (s, a) => s.refs.some((ref) => ref.kind === 'branch' && ref.name === a.name),

  headOnBranch: (s, a) => s.head.kind === 'attached' && s.head.branch === a.name,

  headDetached: (s) => s.head.kind === 'detached',

  repoInitialized: (s) => s.head.kind !== 'none',

  headUnborn: (s, a) => s.head.kind === 'unborn' && (a.branch ? s.head.branch === a.branch : true),

  commitExists: (s, a) => {
    if (a.reachableFrom) {
      // Fail closed: if the named ref does not exist (e.g. origin/main before a push),
      // nothing is reachable from it -> no match (rather than ignoring the scope).
      const scope = refOid(s, a.reachableFrom);
      if (!scope) return false;
      const within = ancestors(s, scope);
      return s.commits.some((c) => c.summary === a.summary && within.has(c.oid));
    }
    return s.commits.some((c) => c.summary === a.summary);
  },

  tipHasParents: (s, a) => {
    const tip = refOid(s, a.branch);
    if (!tip) return false;
    const commit = s.commits.find((c) => c.oid === tip);
    return !!commit && commit.parents.length === a.count;
  },

  branchAhead: (s, a) => {
    const branchTip = refOid(s, a.branch);
    const baseTip = refOid(s, a.base);
    if (!branchTip || !baseTip) return false;
    const inBranch = ancestors(s, branchTip);
    const inBase = ancestors(s, baseTip);
    let ahead = 0;
    for (const oid of inBranch) if (!inBase.has(oid)) ahead++;
    return ahead === a.by;
  },

  commitCount: (s, a) => {
    const tip = refOid(s, a.ref);
    if (!tip) return false;
    return ancestors(s, tip).size === a.count;
  },

  tagExists: (s, a) => {
    const tag = s.refs.find((ref) => ref.kind === 'tag' && ref.name === a.name);
    if (!tag) return false;
    if (!a.on) return true;
    const onOid = refOid(s, a.on);
    return tag.oid === onOid;
  },

  danglingCommitExists: (s, a) =>
    s.commits.some((c) => !c.reachable && (a.summary ? c.summary === a.summary : true)),

  noDanglingCommits: (s) => s.commits.every((c) => c.reachable),

  fileStaged: (s, a) => s.worktree.some((f) => f.path === a.path && f.staged),

  fileInWorktree: (s, a) => s.worktree.some((f) => f.path === a.path && !f.untracked),

  gitConfig: (s, a) => {
    const value = s.config[a.key.toLowerCase()];
    if (value === undefined) return false;
    return a.value === undefined ? value.length > 0 : value === a.value;
  },

  gitCommandUsed: (s, a) => {
    const names = typeof a.name === 'string' ? [a.name] : a.name; // a list matches on any one (OR)
    return s.commands.some(
      (c) =>
        names.includes(c.name) &&
        c.exitCode === 0 && // only a SUCCESSFUL run counts (a failed/invalid call does not)
        (a.argsContain ? a.argsContain.every((t) => c.argv.includes(t)) : true),
    );
  },

  objectExists: (s, a) => s.objects.some((o) => o.kind === a.kind),

  indexEntry: (s, a) => s.index.some((e) => e.path === a.path),
};

const details: { [K in AssertionType]: (a: Of<K>) => string } = {
  branchExists: (a) => `Branch ${a.name} existiert`,
  headOnBranch: (a) => `HEAD ist auf ${a.name}`,
  headDetached: () => `HEAD ist detached`,
  repoInitialized: () => `Repository ist initialisiert`,
  headUnborn: (a) =>
    a.branch ? `Repository initialisiert (Branch ${a.branch}, noch kein Commit)` : `Repository initialisiert (noch kein Commit)`,
  commitExists: (a) => `Commit "${a.summary}" existiert`,
  tipHasParents: (a) => `${a.branch} hat einen Commit mit ${a.count} Eltern`,
  branchAhead: (a) => `${a.branch} ist ${a.by} vor ${a.base}`,
  commitCount: (a) => `${a.ref} hat ${a.count} Commits`,
  tagExists: (a) => `Tag ${a.name} existiert`,
  danglingCommitExists: (a) => `verwaister Commit${a.summary ? ` "${a.summary}"` : ''} existiert`,
  noDanglingCommits: () => `keine verwaisten Commits mehr vorhanden`,
  fileStaged: (a) => `${a.path} ist gestaged`,
  fileInWorktree: (a) => `${a.path} liegt im Arbeitsverzeichnis`,
  gitConfig: (a) =>
    a.value !== undefined ? `git config ${a.key} = "${a.value}"` : `git config ${a.key} ist gesetzt`,
  gitCommandUsed: (a) => {
    const name = typeof a.name === 'string' ? a.name : a.name.join(' oder ');
    return `git ${name}${a.argsContain && a.argsContain.length ? ' ' + a.argsContain.join(' ') : ''} wurde erfolgreich ausgeführt`;
  },
  objectExists: (a) => `ein ${a.kind}-Objekt existiert in der Objektdatenbank`,
  indexEntry: (a) => `${a.path} liegt im Index (Staging-Area)`,
};

/** Evaluates a single assertion against the repo state. */
export function evaluate(state: RepoState, a: Assertion): AssertionResult {
  // Dispatch via the discriminator; a controlled cast because TS cannot interlock
  // union + map by itself at this one spot.
  const predicate = predicates[a.type] as Evaluator<typeof a.type>;
  const detail = (details[a.type] as (x: Assertion) => string)(a);
  return r(a, predicate(state, a as never), detail);
}

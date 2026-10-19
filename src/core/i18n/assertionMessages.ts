import { Assertion, AssertionType } from '../domain/Assertion';
import { Locale, UiLocale, resolveUiLocale } from './Locale';

/**
 * Human-readable checklist texts for assertions, per UI locale. The mapped type enforces that
 * every locale describes every assertion type – a missing entry does not compile.
 */
type Of<K extends AssertionType> = Extract<Assertion, { type: K }>;
type Catalog = { [K in AssertionType]: (a: Of<K>) => string };

const commandName = (name: string | readonly string[], or: string) =>
  typeof name === 'string' ? name : name.join(` ${or} `);
const commandArgs = (args: readonly string[] | undefined) => (args && args.length ? ' ' + args.join(' ') : '');

const catalogs: { [L in UiLocale]: Catalog } = {
  'de-DE': {
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
    gitCommandUsed: (a) => `git ${commandName(a.name, 'oder')}${commandArgs(a.argsContain)} wurde erfolgreich ausgeführt`,
    objectExists: (a) => `ein ${a.kind}-Objekt existiert in der Objektdatenbank`,
    indexEntry: (a) => `${a.path} liegt im Index (Staging-Area)`,
  },
  'en-US': {
    branchExists: (a) => `branch ${a.name} exists`,
    headOnBranch: (a) => `HEAD is on ${a.name}`,
    headDetached: () => `HEAD is detached`,
    repoInitialized: () => `repository is initialized`,
    headUnborn: (a) =>
      a.branch ? `repository initialized (branch ${a.branch}, no commit yet)` : `repository initialized (no commit yet)`,
    commitExists: (a) => `commit "${a.summary}" exists`,
    tipHasParents: (a) => `${a.branch} has a commit with ${a.count} parents`,
    branchAhead: (a) => `${a.branch} is ${a.by} ahead of ${a.base}`,
    commitCount: (a) => `${a.ref} has ${a.count} commits`,
    tagExists: (a) => `tag ${a.name} exists`,
    danglingCommitExists: (a) => `orphaned commit${a.summary ? ` "${a.summary}"` : ''} exists`,
    noDanglingCommits: () => `no orphaned commits left`,
    fileStaged: (a) => `${a.path} is staged`,
    fileInWorktree: (a) => `${a.path} is in the working directory`,
    gitConfig: (a) => (a.value !== undefined ? `git config ${a.key} = "${a.value}"` : `git config ${a.key} is set`),
    gitCommandUsed: (a) => `git ${commandName(a.name, 'or')}${commandArgs(a.argsContain)} ran successfully`,
    objectExists: (a) => `a ${a.kind} object exists in the object database`,
    indexEntry: (a) => `${a.path} is in the index (staging area)`,
  },
};

/** Checklist text for an assertion in the closest supported UI locale. */
export function describeAssertion(a: Assertion, locale: Locale): string {
  const catalog = catalogs[resolveUiLocale(locale)];
  return (catalog[a.type] as (x: Assertion) => string)(a);
}

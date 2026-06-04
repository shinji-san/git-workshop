import { CommitNode, CommitSignature, GitObject, GitObjectKind, IndexEntry, Ref, RefKind, WorktreeFile } from '../../core/domain/RepoState';

/** Pure parsers for the plumbing output. NUL-separated, never split on whitespace. */

const NUL = '\x00';

/** Parses `git for-each-ref --format='%(objectname)%00%(refname)%00%(objecttype)%00%(*objectname)'`. */
export function parseRefs(stdout: string): Ref[] {
  const refs: Ref[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const [objectName, refName, , derefName] = line.split(NUL);
    const oid = derefName && derefName.length > 0 ? derefName : objectName;
    let kind: RefKind | undefined;
    let name = refName;
    if (refName.startsWith('refs/heads/')) {
      kind = 'branch';
      name = refName.slice('refs/heads/'.length);
    } else if (refName.startsWith('refs/tags/')) {
      kind = 'tag';
      name = refName.slice('refs/tags/'.length);
    } else if (refName.startsWith('refs/remotes/')) {
      kind = 'remote';
      name = refName.slice('refs/remotes/'.length);
    }
    if (!kind) continue;
    refs.push({ name, fullName: refName, kind, oid });
  }
  return refs;
}

interface RawCommit {
  oid: string;
  parents: string[];
  summary: string;
  author: CommitSignature;
  committer: CommitSignature;
  message: string;
}

const EMPTY_SIGNATURE: CommitSignature = { name: '', email: '', date: 0, tz: '+0000' };

/**
 * Parses an author/committer line tail (everything after the `author `/`committer ` prefix):
 * `<name> <<email>> <unix-seconds> <±HHMM>`. The trailing `<email> ts tz` is matched greedily
 * from the end, so names containing spaces (or even `<`) stay intact.
 */
function parseSignature(rest: string): CommitSignature {
  const m = rest.match(/^(.*) <([^>]*)> (\d+) ([+-]\d{4})$/);
  if (!m) return EMPTY_SIGNATURE;
  return { name: m[1], email: m[2], date: parseInt(m[3], 10), tz: m[4] };
}

/**
 * Parses the output of `git cat-file --batch` for a list of commit OIDs.
 * Frame per object: `<oid> <type> <size>\n<content (size bytes)>\n`.
 * From the content we read the parent lines, the author/committer signatures and the message
 * (the first line of which is the summary).
 */
export function parseCatFileBatch(stdout: string): RawCommit[] {
  const commits: RawCommit[] = [];
  let i = 0;
  while (i < stdout.length) {
    const headerEnd = stdout.indexOf('\n', i);
    if (headerEnd === -1) break;
    const header = stdout.slice(i, headerEnd);
    const parts = header.split(' ');
    if (parts.length < 3) break;
    const [oid, type, sizeStr] = parts;
    const size = parseInt(sizeStr, 10);
    const contentStart = headerEnd + 1;
    const content = stdout.slice(contentStart, contentStart + size);
    i = contentStart + size + 1; // skip the trailing newline
    if (type !== 'commit') continue;

    const parents: string[] = [];
    let author = EMPTY_SIGNATURE;
    let committer = EMPTY_SIGNATURE;
    const blank = content.indexOf('\n\n');
    const headerBlock = blank === -1 ? content : content.slice(0, blank);
    const message = (blank === -1 ? '' : content.slice(blank + 2)).replace(/\n+$/, '');
    for (const hl of headerBlock.split('\n')) {
      if (hl.startsWith('parent ')) parents.push(hl.slice('parent '.length).trim());
      else if (hl.startsWith('author ')) author = parseSignature(hl.slice('author '.length));
      else if (hl.startsWith('committer ')) committer = parseSignature(hl.slice('committer '.length));
    }
    const summary = message.split('\n')[0] ?? '';
    commits.push({ oid, parents, summary, author, committer, message });
  }
  return commits;
}

/** Joins the raw commits with the reachability set into CommitNodes. */
export function toCommitNodes(raw: RawCommit[], reachable: Set<string>): CommitNode[] {
  return raw.map((c) => ({
    oid: c.oid,
    parents: c.parents,
    summary: c.summary,
    reachable: reachable.has(c.oid),
    author: c.author,
    committer: c.committer,
    message: c.message,
  }));
}

/** Parses lines of OIDs (e.g. `git rev-list --all HEAD`). */
export function parseOidList(stdout: string): Set<string> {
  const set = new Set<string>();
  for (const line of stdout.split('\n')) {
    const oid = line.trim();
    if (oid) set.add(oid);
  }
  return set;
}

/** Parses commit OIDs from `git cat-file --batch-all-objects --batch-check='%(objecttype) %(objectname)'`. */
export function parseAllCommitOids(stdout: string): string[] {
  const oids: string[] = [];
  for (const line of stdout.split('\n')) {
    const [type, oid] = line.split(' ');
    if (type === 'commit' && oid) oids.push(oid.trim());
  }
  return oids;
}

const OBJECT_KINDS = new Set<GitObjectKind>(['blob', 'tree', 'commit', 'tag']);

/** Parses ALL objects (any kind) from the same `--batch-all-objects --batch-check` output. */
export function parseAllObjects(stdout: string): GitObject[] {
  const objects: GitObject[] = [];
  for (const line of stdout.split('\n')) {
    const [type, oid] = line.split(' ');
    if (oid && OBJECT_KINDS.has(type as GitObjectKind)) {
      objects.push({ oid: oid.trim(), kind: type as GitObjectKind });
    }
  }
  return objects;
}

/**
 * Parses `git ls-files --stage -z` into index entries.
 * Frame per entry: `<mode> <oid> <stage>\t<path>` separated by NUL.
 */
export function parseIndex(stdout: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const entry of stdout.split(NUL)) {
    if (!entry) continue;
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    const meta = entry.slice(0, tab).split(' ');
    const path = entry.slice(tab + 1);
    if (meta.length < 2 || !path) continue;
    entries.push({ mode: meta[0], oid: meta[1], path });
  }
  return entries;
}

/**
 * Parses `git config --list -z` into a key/value map.
 * Frame: NUL-separated entries, each entry `key\nvalue` (value may be missing).
 * Keys are lowercased (git normalizes section+name that way anyway), last value
 * wins – matching the semantics of `git config --get`.
 */
export function parseConfigList(stdout: string): { [key: string]: string } {
  const config: { [key: string]: string } = {};
  for (const entry of stdout.split(NUL)) {
    if (!entry) continue;
    const nl = entry.indexOf('\n');
    const key = (nl === -1 ? entry : entry.slice(0, nl)).toLowerCase();
    const value = nl === -1 ? '' : entry.slice(nl + 1);
    config[key] = value;
  }
  return config;
}

/** Parses `git status --porcelain=v2 -z` into worktree entries. */
export function parseStatusV2(stdout: string): WorktreeFile[] {
  const files: WorktreeFile[] = [];
  const tokens = stdout.split(NUL).filter((t) => t.length > 0);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const kind = tok[0];
    if (kind === '1') {
      // "1 <XY> ... <path>"
      const fields = tok.split(' ');
      const xy = fields[1];
      const p = fields.slice(8).join(' ');
      files.push({ path: p, staged: xy[0] !== '.', modified: xy[1] !== '.', untracked: false });
    } else if (kind === '2') {
      // renamed/copied: path + one extra NUL field (original path)
      const fields = tok.split(' ');
      const xy = fields[1];
      const p = fields.slice(9).join(' ');
      files.push({ path: p, staged: xy[0] !== '.', modified: xy[1] !== '.', untracked: false });
      i++; // skip the original-path token
    } else if (kind === '?') {
      files.push({ path: tok.slice(2), staged: false, modified: false, untracked: true });
    }
  }
  return files;
}

import { describe, expect, it } from 'vitest';
import {
  parseAllCommitOids,
  parseAllObjects,
  parseCatFileBatch,
  parseConfigList,
  parseIndex,
  parseOidList,
  parseRefs,
  parseStatusV2,
} from '../../src/infrastructure/git/parsers';

describe('parseRefs', () => {
  it('parses branches, tags and dereferenced tag OIDs', () => {
    const NUL = '\x00';
    const out =
      ['aaa', 'refs/heads/main', 'commit', ''].join(NUL) +
      '\n' +
      ['tagobj', 'refs/tags/v1.0', 'tag', 'ccc'].join(NUL) +
      '\n';
    const refs = parseRefs(out);
    expect(refs).toEqual([
      { name: 'main', fullName: 'refs/heads/main', kind: 'branch', oid: 'aaa' },
      { name: 'v1.0', fullName: 'refs/tags/v1.0', kind: 'tag', oid: 'ccc' },
    ]);
  });
});

describe('parseCatFileBatch', () => {
  it('parses parents, author/committer signatures (with tz) and the full message', () => {
    const c1 =
      'tree t1\nparent p1\nparent p2\nauthor Ann Author <ann@x> 1699990000 +0200\ncommitter Carl Committer <carl@x> 1700000000 +0100\n\nMerge feature\n\nmehr text';
    const c2 = 'tree t2\nauthor A <a@x> 50 +0000\ncommitter C <c@x> 1699999000 +0000\n\nInit';
    const out =
      `m1 commit ${c1.length}\n${c1}\n` +
      `r1 commit ${c2.length}\n${c2}\n`;
    const commits = parseCatFileBatch(out);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toMatchObject({
      oid: 'm1',
      parents: ['p1', 'p2'],
      summary: 'Merge feature',
      message: 'Merge feature\n\nmehr text', // full body, not just the first line
      author: { name: 'Ann Author', email: 'ann@x', date: 1699990000, tz: '+0200' },
      committer: { name: 'Carl Committer', email: 'carl@x', date: 1700000000, tz: '+0100' },
    });
    expect(commits[1]).toMatchObject({
      oid: 'r1',
      parents: [],
      summary: 'Init',
      message: 'Init',
      committer: { name: 'C', email: 'c@x', date: 1699999000, tz: '+0000' },
    });
  });
});

describe('parseAllCommitOids', () => {
  it('filters commits only', () => {
    const out = 'commit aaa\nblob bbb\ntree ccc\ncommit ddd\n';
    expect(parseAllCommitOids(out)).toEqual(['aaa', 'ddd']);
  });
});

describe('parseAllObjects', () => {
  it('keeps every object kind with its OID', () => {
    const out = 'commit aaa\nblob bbb\ntree ccc\ntag ddd\nbogus eee\n';
    expect(parseAllObjects(out)).toEqual([
      { oid: 'aaa', kind: 'commit' },
      { oid: 'bbb', kind: 'blob' },
      { oid: 'ccc', kind: 'tree' },
      { oid: 'ddd', kind: 'tag' },
    ]);
  });
});

describe('parseIndex', () => {
  it('parses mode, oid and path from ls-files --stage -z', () => {
    const NUL = '\x00';
    const out =
      `100644 aaaaaaa 0\tbrief.txt${NUL}` +
      `100755 bbbbbbb 0\tbin/run.sh${NUL}`;
    expect(parseIndex(out)).toEqual([
      { mode: '100644', oid: 'aaaaaaa', path: 'brief.txt' },
      { mode: '100755', oid: 'bbbbbbb', path: 'bin/run.sh' },
    ]);
  });

  it('returns empty for an empty index', () => {
    expect(parseIndex('')).toEqual([]);
  });
});

describe('parseOidList', () => {
  it('collects OIDs into a set', () => {
    expect([...parseOidList('aaa\nbbb\n\nccc\n')]).toEqual(['aaa', 'bbb', 'ccc']);
  });
});

describe('parseConfigList', () => {
  it('parses NUL-separated key\\nvalue entries, lowercased, last wins', () => {
    const NUL = '\x00';
    const out =
      `user.name\nWorkshop-Teilnehmer${NUL}` +
      `user.email\nworkshop@local${NUL}` +
      `init.defaultbranch\nmain${NUL}` +
      `user.name\nMax Mustermann${NUL}`; // overwrites the first value
    expect(parseConfigList(out)).toEqual({
      'user.name': 'Max Mustermann',
      'user.email': 'workshop@local',
      'init.defaultbranch': 'main',
    });
  });

  it('treats a valueless key as an empty string', () => {
    expect(parseConfigList('core.bare\x00')).toEqual({ 'core.bare': '' });
  });
});

describe('parseStatusV2', () => {
  it('detects staged, modified and untracked', () => {
    const NUL = '\x00';
    const out =
      `1 M. N... 100644 100644 100644 aaa bbb staged.txt${NUL}` +
      `1 .M N... 100644 100644 100644 aaa bbb modified.txt${NUL}` +
      `? untracked.txt${NUL}`;
    const files = parseStatusV2(out);
    expect(files).toEqual([
      { path: 'staged.txt', staged: true, modified: false, untracked: false },
      { path: 'modified.txt', staged: false, modified: true, untracked: false },
      { path: 'untracked.txt', staged: false, modified: false, untracked: true },
    ]);
  });
});

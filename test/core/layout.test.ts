import { describe, expect, it } from 'vitest';
import { RepoState, CommitNode } from '../../src/core/domain/RepoState';
import { layout } from '../../src/core/graph/layout';

const mk = (oid: string, parents: string[], date: number, reachable = true): CommitNode => ({
  oid,
  parents,
  summary: oid,
  reachable,
  author: { name: `author-${oid}`, email: `${oid}@x`, date, tz: '+0000' },
  committer: { name: `committer-${oid}`, email: `${oid}@x`, date, tz: '+0000' },
  message: oid,
});

const wrap = (commits: CommitNode[], refs: RepoState['refs'] = [], head: RepoState['head'] = { kind: 'detached', oid: commits[0]?.oid ?? '' }): RepoState => ({
  commits,
  refs,
  head,
  worktree: [],
  config: {},
  objects: [],
  index: [],
  commands: [],
});

describe('layout', () => {
  it('linear chain: one lane, rows by date, n-1 edges', () => {
    const s = wrap([mk('c3', ['c2'], 30), mk('c2', ['c1'], 20), mk('c1', [], 10)]);
    const g = layout(s);
    expect(g.componentCount).toBe(1);
    const byOid = new Map(g.nodes.map((n) => [n.oid, n]));
    expect(byOid.get('c3')!.row).toBe(0); // newest on top
    expect(byOid.get('c1')!.row).toBe(2);
    expect(g.nodes.every((n) => n.lane === 0)).toBe(true);
    expect(g.edges).toHaveLength(2);
  });

  it('diamond: one component, multiple lanes, 4 edges', () => {
    const s = wrap([
      mk('m', ['a', 'b'], 50),
      mk('a', ['r'], 40),
      mk('b', ['r'], 30),
      mk('r', [], 10),
    ]);
    const g = layout(s);
    expect(g.componentCount).toBe(1);
    expect(g.edges).toHaveLength(4);
    const lanes = new Set(g.nodes.map((n) => n.lane));
    expect(lanes.size).toBeGreaterThanOrEqual(2);
    expect(g.nodes.find((n) => n.oid === 'm')!.row).toBe(0);
  });

  it('disconnected components land in their own lane bands', () => {
    const s = wrap([
      mk('x1', ['x0'], 50),
      mk('x0', [], 40),
      mk('y1', ['y0'], 30, false),
      mk('y0', [], 20, false),
    ]);
    const g = layout(s);
    expect(g.componentCount).toBe(2);
    const comp0Lanes = g.nodes.filter((n) => n.component === 0).map((n) => n.lane);
    const comp1Lanes = g.nodes.filter((n) => n.component === 1).map((n) => n.lane);
    expect(Math.max(...comp0Lanes)).toBeLessThan(Math.min(...comp1Lanes));
  });

  it('passes the reachable flag through', () => {
    const s = wrap([mk('a', [], 10, false)]);
    const g = layout(s);
    expect(g.nodes[0].reachable).toBe(false);
  });

  it('carries the per-commit detail sidecar (author/committer/message) keyed by oid', () => {
    const s = wrap([mk('a', [], 10)]);
    const g = layout(s);
    const detail = g.commits.find((c) => c.oid === 'a');
    expect(detail).toMatchObject({
      author: { name: 'author-a', email: 'a@x', date: 10, tz: '+0000' },
      committer: { name: 'committer-a', email: 'a@x', date: 10, tz: '+0000' },
      message: 'a',
    });
  });

  it('HEAD and refs are attached as labels', () => {
    const s = wrap(
      [mk('a', [], 10)],
      [{ name: 'main', fullName: 'refs/heads/main', kind: 'branch', oid: 'a' }],
      { kind: 'attached', branch: 'main', oid: 'a' },
    );
    const g = layout(s);
    const labels = g.nodes[0].refs.map((r) => r.kind);
    expect(labels).toContain('branch');
    expect(labels).toContain('head');
  });
});

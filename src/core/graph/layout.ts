import { CommitNode, RepoState } from '../domain/RepoState';
import { CommitDetail, GraphLayout, LayoutEdge, PositionedNode, RefLabel } from './GraphLayout';

/**
 * Pure railroad layout algorithm.
 *
 * 1. Connected components (union-find over parent edges, undirected).
 * 2. Topological sort: child before parent, tiebreaker = committer.date descending.
 * 3. Lane assignment per component (first parent stays in the lane, merges branch off),
 *    each component in its own offset lane band -> orphans appear detached.
 *
 * `previous` is the hysteresis seam for stable d3 animations: later the lane
 * assignment can use it to prefer a commit's previous lane. The function stays
 * pure (deterministic from two inputs, no IO).
 */
export function layout(state: RepoState, previous?: GraphLayout): GraphLayout {
  void previous; // reserved for hysteresis (see README)

  const commits = state.commits;
  const byOid = new Map<string, CommitNode>(commits.map((c) => [c.oid, c]));
  const hasParent = (p: string) => byOid.has(p);

  // 1. Components
  const ufParent = new Map<string, string>();
  for (const c of commits) ufParent.set(c.oid, c.oid);
  const find = (x: string): string => {
    let r = x;
    while (ufParent.get(r) !== r) r = ufParent.get(r)!;
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) ufParent.set(ra, rb);
  };
  for (const c of commits) for (const p of c.parents) if (hasParent(p)) union(c.oid, p);

  // 2. Topological sort (Kahn, child before parent), tiebreak by date desc
  const remainingChildren = new Map<string, number>();
  for (const c of commits) remainingChildren.set(c.oid, 0);
  for (const c of commits)
    for (const p of c.parents)
      if (hasParent(p)) remainingChildren.set(p, (remainingChildren.get(p) ?? 0) + 1);

  const available: CommitNode[] = commits.filter((c) => (remainingChildren.get(c.oid) ?? 0) === 0);
  const order: CommitNode[] = [];
  const pickNewest = (arr: CommitNode[]): CommitNode => {
    let best = 0;
    for (let i = 1; i < arr.length; i++) if (arr[i].committer.date > arr[best].committer.date) best = i;
    return arr.splice(best, 1)[0];
  };
  while (available.length) {
    const c = pickNewest(available);
    order.push(c);
    for (const p of c.parents) {
      if (!hasParent(p)) continue;
      const left = (remainingChildren.get(p) ?? 0) - 1;
      remainingChildren.set(p, left);
      if (left === 0) available.push(byOid.get(p)!);
    }
  }
  // Safety net (impossible in Git, but robust): append remaining nodes
  if (order.length < commits.length) {
    const seen = new Set(order.map((c) => c.oid));
    for (const c of commits) if (!seen.has(c.oid)) order.push(c);
  }

  // Stable component numbering by first appearance in the order
  const compIndex = new Map<string, number>();
  let componentCount = 0;
  for (const c of order) {
    const root = find(c.oid);
    if (!compIndex.has(root)) compIndex.set(root, componentCount++);
  }
  const componentOf = (oid: string) => compIndex.get(find(oid))!;

  // 3. Lane assignment per component
  const active: Array<Map<string, number>> = Array.from({ length: componentCount }, () => new Map());
  const freeLanes: number[][] = Array.from({ length: componentCount }, () => []);
  const nextLane: number[] = Array.from({ length: componentCount }, () => 0);
  const maxLane: number[] = Array.from({ length: componentCount }, () => 0);
  const localLane = new Map<string, number>();

  const alloc = (comp: number): number => {
    if (freeLanes[comp].length) {
      freeLanes[comp].sort((a, b) => a - b);
      return freeLanes[comp].shift()!;
    }
    return nextLane[comp]++;
  };

  for (const c of order) {
    const comp = componentOf(c.oid);
    let lane: number;
    if (active[comp].has(c.oid)) {
      lane = active[comp].get(c.oid)!;
      active[comp].delete(c.oid);
    } else {
      lane = alloc(comp);
    }
    localLane.set(c.oid, lane);
    maxLane[comp] = Math.max(maxLane[comp], lane);

    let firstParentKept = false;
    for (const p of c.parents) {
      if (!hasParent(p)) continue;
      if (!firstParentKept) {
        active[comp].set(p, lane); // first parent stays in the lane
        firstParentKept = true;
      } else {
        const pl = alloc(comp); // merge -> new lane
        active[comp].set(p, pl);
        maxLane[comp] = Math.max(maxLane[comp], pl);
      }
    }
    if (!firstParentKept) freeLanes[comp].push(lane); // root: lane becomes free
  }

  // band offset per component
  const band: number[] = [];
  let acc = 0;
  for (let i = 0; i < componentCount; i++) {
    band[i] = acc;
    acc += maxLane[i] + 2; // gap between components
  }

  // refs/HEAD per OID
  const refsByOid = new Map<string, RefLabel[]>();
  const addRef = (oid: string, label: RefLabel) => {
    const arr = refsByOid.get(oid) ?? [];
    arr.push(label);
    refsByOid.set(oid, arr);
  };
  for (const r of state.refs) addRef(r.oid, { name: r.name, kind: r.kind });
  if (state.head.kind === 'attached' || state.head.kind === 'detached') {
    addRef(state.head.oid, { name: 'HEAD', kind: 'head' });
  }

  const rowOf = new Map<string, number>();
  order.forEach((c, i) => rowOf.set(c.oid, i));

  const nodes: PositionedNode[] = order.map((c) => {
    const comp = componentOf(c.oid);
    return {
      oid: c.oid,
      row: rowOf.get(c.oid)!,
      lane: band[comp] + localLane.get(c.oid)!,
      component: comp,
      reachable: c.reachable,
      summary: c.summary,
      refs: refsByOid.get(c.oid) ?? [],
    };
  });

  const edges: LayoutEdge[] = [];
  for (const c of commits)
    for (const p of c.parents)
      if (hasParent(p))
        edges.push({
          child: c.oid,
          parent: p,
          fromLane: band[componentOf(c.oid)] + localLane.get(c.oid)!,
          toLane: band[componentOf(p)] + localLane.get(p)!,
        });

  const commitDetails: CommitDetail[] = commits.map((c) => ({
    oid: c.oid,
    author: c.author,
    committer: c.committer,
    message: c.message,
  }));

  return { nodes, edges, componentCount, commits: commitDetails };
}

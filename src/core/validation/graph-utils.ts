import { RepoState } from '../domain/RepoState';

/** Pure graph helpers over the RepoState – basis of all topological assertions. */

export function refOid(state: RepoState, name: string): string | undefined {
  const direct = state.refs.find((r) => r.name === name);
  if (direct) return direct.oid;
  // "main" can also be resolved via HEAD
  if (state.head.kind === 'attached' && state.head.branch === name) return state.head.oid;
  return undefined;
}

/** All ancestors of a commit including itself (follows parent edges). */
export function ancestors(state: RepoState, startOid: string): Set<string> {
  const byOid = new Map(state.commits.map((c) => [c.oid, c]));
  const seen = new Set<string>();
  const stack = [startOid];
  while (stack.length) {
    const oid = stack.pop()!;
    if (seen.has(oid)) continue;
    seen.add(oid);
    const c = byOid.get(oid);
    if (!c) continue;
    for (const p of c.parents) if (!seen.has(p)) stack.push(p);
  }
  return seen;
}

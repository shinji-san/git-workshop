import type { CommitSignature } from '../domain/RepoState';

/** Pure layout result: abstract row/lane coordinates, no SVG, no DOM. */
export type RefLabelKind = 'branch' | 'tag' | 'remote' | 'head';

/** Per-commit metadata sidecar for the renderer's commit-detail popup (keyed by oid). */
export interface CommitDetail {
  readonly oid: string;
  readonly author: CommitSignature;
  readonly committer: CommitSignature;
  readonly message: string;
}

export interface RefLabel {
  readonly name: string;
  readonly kind: RefLabelKind;
}

export interface PositionedNode {
  readonly oid: string;
  /** Topological/temporal axis (0 = newest tip). */
  readonly row: number;
  /** Column (incl. band offset for disconnected components). */
  readonly lane: number;
  /** Index of the connected component. */
  readonly component: number;
  /** false => render detached (orphaned). */
  readonly reachable: boolean;
  readonly summary: string;
  readonly refs: readonly RefLabel[];
}

export interface LayoutEdge {
  readonly child: string;
  readonly parent: string;
  readonly fromLane: number;
  readonly toLane: number;
}

export interface GraphLayout {
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly LayoutEdge[];
  /** > 1 means there are orphaned/disconnected components. */
  readonly componentCount: number;
  /** Full commit metadata (author/committer/message), looked up by oid on node click. */
  readonly commits: readonly CommitDetail[];
}

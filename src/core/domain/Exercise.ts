import { Assertion } from './Assertion';
import { Pitfall } from './Pitfall';

/** Provisioning: the bundle carries the committed history, setup the ephemeral state. */
export interface Provisioning {
  /** Path to the .bundle file (relative to the exercise package). Absent = start empty (no repo). */
  readonly bundle?: string;
  /** false (default): remove origin after cloning. */
  readonly keepOrigin?: boolean;
  /** Optional commands that run in the sandbox shell AFTER cloning
   *  (worktree/index/in-progress states a bundle cannot carry). */
  readonly setup?: readonly string[];
}

export interface Step {
  readonly id: string;
  readonly title: string;
  /** Task text for the right-hand panel. */
  readonly task: string;
  /** All assertions must hold (AND) for the step to be satisfied. */
  readonly goals: readonly Assertion[];
  /** Escalating hint ladder, revealed one at a time on demand. */
  readonly hints?: readonly string[];
  /** Step-specific pitfalls. */
  readonly pitfalls?: readonly Pitfall[];
}

export interface Exercise {
  /** Stable identity (UUID); used as the key for progress tracking. */
  readonly id: string;
  /** Dotted chapter number for ordering/display (e.g. "1.1"). */
  readonly chapter: string;
  readonly title: string;
  /** Optional time budget in minutes for the status-bar timer. */
  readonly durationMinutes?: number;
  /** Concept framing shown (foldable) above the goals while the exercise runs. Optional. */
  readonly intro?: string;
  /** Wrap-up shown on completion ("what happened / why / real-world use"). Optional. */
  readonly debrief?: string;
  readonly provisioning: Provisioning;
  /** Pitfalls that apply in every step. */
  readonly commonPitfalls?: readonly Pitfall[];
  /** The sequence – array order is the step order. */
  readonly steps: readonly Step[];
}

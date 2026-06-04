import { Assertion } from './Assertion';

export type Severity = 'info' | 'warning' | 'danger';

/**
 * Affirmative detection of a bad state (not "goal not met").
 * `when` is evaluated as AND: all assertions must hold for the pitfall to fire.
 */
export interface Pitfall {
  /** Stable identity for edge-triggering (only report on transition). */
  readonly id: string;
  readonly when: readonly Assertion[];
  readonly severity: Severity;
  readonly message: string;
  /** Optional hint on how to undo the mistake. */
  readonly recovery?: string;
}

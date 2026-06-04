import { Assertion } from './Assertion';

export interface AssertionResult {
  readonly assertion: Assertion;
  readonly passed: boolean;
  /** Human-readable text for the task panel (checklist). */
  readonly detail: string;
}

export interface Verdict {
  /** true when all goals of the step are met. */
  readonly satisfied: boolean;
  readonly results: readonly AssertionResult[];
}

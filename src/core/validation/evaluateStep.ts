import { Assertion } from '../domain/Assertion';
import { Pitfall } from '../domain/Pitfall';
import { RepoState } from '../domain/RepoState';
import { Verdict } from '../domain/Verdict';
import { Locale } from '../i18n/Locale';
import { evaluate, holds } from './evaluators';

/** Does the current state satisfy all goals of the step? (AND semantics; texts in `locale`) */
export function evaluateStep(state: RepoState, goals: readonly Assertion[], locale: Locale): Verdict {
  const results = goals.map((g) => evaluate(state, g, locale));
  return { satisfied: results.every((res) => res.passed), results };
}

/** Which pitfalls currently apply? (each pitfall: AND over its `when` assertions) */
export function matchPitfalls(state: RepoState, pitfalls: readonly Pitfall[]): Pitfall[] {
  return pitfalls.filter((p) => p.when.every((a) => holds(state, a)));
}

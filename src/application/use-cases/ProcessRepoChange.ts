import { IClock } from '../../core/ports/IClock';
import { IGitInspector } from '../../core/ports/IGitInspector';
import { Pitfall } from '../../core/domain/Pitfall';
import { RepoState } from '../../core/domain/RepoState';
import { Verdict } from '../../core/domain/Verdict';
import { evaluateStep, matchPitfalls } from '../../core/validation/evaluateStep';
import { SessionContext } from '../SessionContext';

export interface TickResult {
  readonly state: RepoState;
  readonly verdict: Verdict;
  readonly advanced: boolean;
  readonly isComplete: boolean;
  /** Only newly appeared pitfalls (edge-triggering – don't nag on every tick). */
  readonly newPitfalls: readonly Pitfall[];
  /** Hint automatically revealed by stuck detection, if any. */
  readonly revealedHint?: string;
}

/**
 * The central tick: runs (debounced) on every change to the sandbox.
 * Reads the state, evaluates the goals, advances if applicable, edge-triggers pitfalls
 * and automatically offers the next hint when the user is stuck.
 */
export class ProcessRepoChange {
  constructor(
    private readonly git: IGitInspector,
    private readonly clock: IClock,
  ) {}

  async execute(ctx: SessionContext): Promise<TickResult> {
    const state = await this.git.snapshot(ctx.repoPath, ctx.sandbox.env);

    if (ctx.progress.isComplete) {
      return {
        state,
        verdict: { satisfied: true, results: [] },
        advanced: false,
        isComplete: true,
        newPitfalls: [],
      };
    }

    // The step we start on drives pitfalls/hints this tick.
    const startStep = ctx.progress.currentStep;

    // Advance through every step the current state already satisfies (one action may
    // complete more than one step). Each advance is justified by that step's own goals.
    let advanced = false;
    while (!ctx.progress.isComplete) {
      const stepVerdict = evaluateStep(state, ctx.progress.currentStep.goals);
      if (!stepVerdict.satisfied) break;
      ctx.progress.advance(stepVerdict);
      advanced = true;
    }
    if (advanced) ctx.resetStepRuntime(this.clock.now());

    // Report the verdict of the step now in focus, so the panel shows the goals still to
    // do – not the (passed) checks of an already-completed step.
    const verdict = ctx.progress.isComplete
      ? { satisfied: true, results: [] }
      : evaluateStep(state, ctx.progress.currentStep.goals);

    const candidates = [...(startStep.pitfalls ?? []), ...(ctx.exercise.commonPitfalls ?? [])];
    const matched = matchPitfalls(state, candidates);
    const newPitfalls = matched.filter((p) => !ctx.matchedPitfalls.has(p.id));
    ctx.matchedPitfalls = new Set(matched.map((p) => p.id));

    let revealedHint: string | undefined;
    if (!advanced) {
      const stuck = this.clock.now() - ctx.lastProgressAt >= ctx.stuckThresholdMs;
      if (stuck) revealedHint = ctx.revealNextHint();
    }

    return {
      state,
      verdict,
      advanced,
      isComplete: ctx.progress.isComplete,
      newPitfalls,
      revealedHint,
    };
  }
}

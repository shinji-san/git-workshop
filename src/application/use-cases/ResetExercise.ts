import { ISandboxManager } from '../../core/ports/ISandboxManager';
import { IClock } from '../../core/ports/IClock';
import { ExerciseProgress } from '../../core/domain/ExerciseProgress';
import { SessionContext } from '../SessionContext';

/** Resets the sandbox (clone-then-swap) and progress back to the start. */
export class ResetExercise {
  constructor(
    private readonly sandboxes: ISandboxManager,
    private readonly clock: IClock,
  ) {}

  async execute(ctx: SessionContext): Promise<SessionContext> {
    const sandbox = await this.sandboxes.reset(ctx.sandbox, ctx.exercise);
    const progress = ExerciseProgress.start(ctx.exercise);
    return new SessionContext(ctx.exercise, sandbox, progress, this.clock.now(), ctx.stuckThresholdMs);
  }
}

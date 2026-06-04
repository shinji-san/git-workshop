import { IClock } from '../../core/ports/IClock';
import { IExerciseRepository } from '../../core/ports/IExerciseRepository';
import { ISandboxManager } from '../../core/ports/ISandboxManager';
import { ExerciseProgress } from '../../core/domain/ExerciseProgress';
import { SessionContext } from '../SessionContext';

/**
 * Resumes a paused exercise: rebuilds the sandbox from its saved snapshot and
 * positions progress at the last reached step. Counterpart to StartExercise (fresh).
 */
export class ResumeExercise {
  constructor(
    private readonly repo: IExerciseRepository,
    private readonly sandboxes: ISandboxManager,
    private readonly clock: IClock,
  ) {}

  async execute(exerciseId: string, snapshotPath: string, stepIndex: number): Promise<SessionContext> {
    const exercise = await this.repo.load(exerciseId);
    const sandbox = await this.sandboxes.createFromSnapshot(snapshotPath);
    const progress = ExerciseProgress.resumeAt(exercise, stepIndex);
    return new SessionContext(exercise, sandbox, progress, this.clock.now());
  }
}

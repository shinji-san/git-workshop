import { IClock } from '../../core/ports/IClock';
import { IExerciseRepository } from '../../core/ports/IExerciseRepository';
import { ISandboxManager } from '../../core/ports/ISandboxManager';
import { ExerciseProgress } from '../../core/domain/ExerciseProgress';
import { SessionContext } from '../SessionContext';

/** Loads an exercise, provisions its sandbox and creates the SessionContext. */
export class StartExercise {
  constructor(
    private readonly repo: IExerciseRepository,
    private readonly sandboxes: ISandboxManager,
    private readonly clock: IClock,
  ) {}

  async execute(exerciseId: string): Promise<SessionContext> {
    const exercise = await this.repo.load(exerciseId);
    const sandbox = await this.sandboxes.create(exercise);
    const progress = ExerciseProgress.start(exercise);
    return new SessionContext(exercise, sandbox, progress, this.clock.now());
  }
}

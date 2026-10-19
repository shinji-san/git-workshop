import { IClock } from '../../core/ports/IClock';
import { IExerciseRepository } from '../../core/ports/IExerciseRepository';
import { ISandboxManager } from '../../core/ports/ISandboxManager';
import { ExerciseProgress } from '../../core/domain/ExerciseProgress';
import { Locale } from '../../core/i18n/Locale';
import { SessionContext } from '../SessionContext';

/** Loads an exercise, provisions its sandbox and creates the SessionContext. */
export class StartExercise {
  constructor(
    private readonly repo: IExerciseRepository,
    private readonly sandboxes: ISandboxManager,
    private readonly clock: IClock,
  ) {}

  /** `locale`: the UI language; texts AND sandbox content are built for it (fallback if missing). */
  async execute(exerciseId: string, locale: Locale): Promise<SessionContext> {
    const exercise = await this.repo.load(exerciseId, locale);
    const sandbox = await this.sandboxes.create(exercise);
    const progress = ExerciseProgress.start(exercise);
    return new SessionContext(exercise, sandbox, progress, this.clock.now());
  }
}

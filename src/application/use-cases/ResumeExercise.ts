import { IClock } from '../../core/ports/IClock';
import { IExerciseRepository } from '../../core/ports/IExerciseRepository';
import { ISandboxManager } from '../../core/ports/ISandboxManager';
import { ExerciseProgress } from '../../core/domain/ExerciseProgress';
import { Locale } from '../../core/i18n/Locale';
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

  /**
   * `locale` is the UI language for the texts; `contentLocale` is the language the snapshot's
   * sandbox was provisioned in (recorded on pause) – its `vars` must be reused so the goals keep
   * matching the existing file names, commit messages and branch names.
   */
  async execute(
    exerciseId: string,
    snapshotPath: string,
    stepIndex: number,
    locale: Locale,
    contentLocale: Locale,
  ): Promise<SessionContext> {
    const exercise = await this.repo.load(exerciseId, locale, contentLocale);
    const sandbox = await this.sandboxes.createFromSnapshot(snapshotPath);
    const progress = ExerciseProgress.resumeAt(exercise, stepIndex);
    return new SessionContext(exercise, sandbox, progress, this.clock.now());
  }
}

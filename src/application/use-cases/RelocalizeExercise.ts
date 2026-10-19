import { IExerciseRepository } from '../../core/ports/IExerciseRepository';
import { Locale } from '../../core/i18n/Locale';
import { SessionContext } from '../SessionContext';

/**
 * Live language switch for a running attempt: reload the exercise's texts in `locale` while keeping
 * the sandbox, the step and the hint/pitfall runtime. The CONTENT locale stays what the sandbox was
 * provisioned with, so file names, commit messages and branch names in the new texts still match.
 */
export class RelocalizeExercise {
  constructor(private readonly repo: IExerciseRepository) {}

  async execute(ctx: SessionContext, locale: Locale): Promise<SessionContext> {
    const exercise = await this.repo.load(ctx.exercise.id, locale, ctx.exercise.contentLocale);
    if (exercise.locale === ctx.exercise.locale) return ctx; // resolved to the same texts – nothing to do
    return SessionContext.relocalized(ctx, exercise);
  }
}

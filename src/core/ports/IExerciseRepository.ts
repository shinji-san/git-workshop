import { Exercise } from '../domain/Exercise';
import { Locale } from '../i18n/Locale';

export interface ExerciseSummary {
  /** Stable identity (UUID). */
  readonly id: string;
  /** Dotted chapter number for ordering/display (e.g. "1.1"). */
  readonly chapter: string;
  /** Title in `locale`. */
  readonly title: string;
  /** The texts locale actually resolved for this listing (may be a fallback of the requested one). */
  readonly locale: Locale;
  /** True when the exercise carries an unlock gate (a code is required). The code/hash never
   *  leaves main — only this flag does, so the renderer can show the lock without learning the code. */
  readonly gated: boolean;
}

/**
 * Exercise packages are multilingual: a language-neutral structure plus one texts file per locale.
 * Every read takes the wanted locale and resolves the best available texts (exact tag → same
 * language → default → first), so a package never disappears just because a translation is missing.
 */
export interface IExerciseRepository {
  list(locale: Locale): Promise<ExerciseSummary[]>;
  /**
   * Load an exercise with its texts in `locale`. `contentLocale` selects the `vars` (file names,
   * commit messages, …) substituted into structure AND texts; it defaults to the resolved texts
   * locale and is only passed explicitly when a sandbox already exists in another language
   * (resume, live language switch).
   */
  load(id: string, locale: Locale, contentLocale?: Locale): Promise<Exercise>;
  /** Ids of gated exercises whose stored unlock hash matches `code`. Used by the unlock use case;
   *  the comparison (and the codes) stay inside the repository. */
  matchUnlockCode(code: string): Promise<string[]>;
}

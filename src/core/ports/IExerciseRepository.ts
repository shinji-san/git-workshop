import { Exercise } from '../domain/Exercise';

export interface ExerciseSummary {
  /** Stable identity (UUID). */
  readonly id: string;
  /** Dotted chapter number for ordering/display (e.g. "1.1"). */
  readonly chapter: string;
  readonly title: string;
  /** True when the exercise carries an unlock gate (a code is required). The code/hash never
   *  leaves main — only this flag does, so the renderer can show the lock without learning the code. */
  readonly gated: boolean;
}

export interface IExerciseRepository {
  list(): Promise<ExerciseSummary[]>;
  load(id: string): Promise<Exercise>;
  /** Ids of gated exercises whose stored unlock hash matches `code`. Used by the unlock use case;
   *  the comparison (and the codes) stay inside the repository. */
  matchUnlockCode(code: string): Promise<string[]>;
}

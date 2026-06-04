import { Exercise, Step } from './Exercise';
import { Verdict } from './Verdict';

/**
 * Pure aggregate: guards the legal transitions through the step sequence.
 * No IO, no repoPath – just the step index and the invariant "forward only,
 * only on a satisfied step". Runtime state (sandbox etc.) lives in SessionContext.
 */
export class ExerciseProgress {
  private constructor(
    private readonly steps: readonly Step[],
    private idx: number,
  ) {}

  static start(exercise: Exercise): ExerciseProgress {
    return new ExerciseProgress(exercise.steps, 0);
  }

  /** Resume at a previously reached step (clamped to the valid range). */
  static resumeAt(exercise: Exercise, stepIndex: number): ExerciseProgress {
    const clamped = Math.max(0, Math.min(stepIndex, exercise.steps.length));
    return new ExerciseProgress(exercise.steps, clamped);
  }

  get index(): number {
    return this.idx;
  }

  get stepCount(): number {
    return this.steps.length;
  }

  get currentStep(): Step {
    if (this.isComplete) {
      throw new Error('Keine aktiven Schritte mehr – die Aufgabe ist abgeschlossen.');
    }
    return this.steps[this.idx];
  }

  get isComplete(): boolean {
    return this.idx >= this.steps.length;
  }

  /** Invariant: forward only, and only when the current step is satisfied. */
  advance(verdict: Verdict): void {
    if (this.isComplete || !verdict.satisfied) return;
    this.idx++;
  }
}

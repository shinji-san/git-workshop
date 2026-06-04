import { Exercise } from '../core/domain/Exercise';
import { ExerciseProgress } from '../core/domain/ExerciseProgress';
import { Sandbox } from '../core/ports/ISandboxManager';

/**
 * Runtime carrier of an exercise attempt (application layer).
 * Holds the ephemeral state the pure ExerciseProgress aggregate deliberately does NOT know:
 * sandbox/repoPath, revealed hints, already-reported pitfalls, stuck timestamp.
 */
export class SessionContext {
  revealedHints = 0;
  matchedPitfalls = new Set<string>();
  lastProgressAt: number;

  constructor(
    public readonly exercise: Exercise,
    public sandbox: Sandbox,
    public readonly progress: ExerciseProgress,
    startedAt: number,
    /** Threshold for stuck detection in milliseconds. */
    public readonly stuckThresholdMs = 90_000,
  ) {
    this.lastProgressAt = startedAt;
  }

  get repoPath(): string {
    return this.sandbox.repoPath;
  }

  /** On advancing: reset the hint ladder and stuck clock for the new step. */
  resetStepRuntime(now: number): void {
    this.revealedHints = 0;
    this.lastProgressAt = now;
  }

  /** Reveal the next hint of the current ladder (manually or via stuck detection). */
  revealNextHint(): string | undefined {
    if (this.progress.isComplete) return undefined;
    const hints = this.progress.currentStep.hints ?? [];
    if (this.revealedHints >= hints.length) return undefined;
    return hints[this.revealedHints++];
  }
}

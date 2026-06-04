import { IExerciseRepository } from '../../core/ports/IExerciseRepository';
import { IProgressStore } from '../../core/ports/IProgressStore';
import { ParticipantProgress } from '../../core/domain/ParticipantProgress';

/**
 * Unlocks gated exercises whose code matches the typed one. The repository owns the comparison
 * (codes/hashes never leave it); this use case records the freshly unlocked ids in progress and
 * persists. Returns the ids newly unlocked (empty = wrong code, or all matches already unlocked).
 */
export class UnlockExercises {
  constructor(
    private readonly repo: IExerciseRepository,
    private readonly progressStore: IProgressStore,
  ) {}

  async execute(progress: ParticipantProgress, code: string): Promise<string[]> {
    const matches = await this.repo.matchUnlockCode(code);
    const fresh = matches.filter((id) => !progress.isUnlocked(id));
    if (fresh.length > 0) {
      progress.recordUnlocked(fresh);
      await this.progressStore.save(progress);
    }
    return fresh;
  }
}
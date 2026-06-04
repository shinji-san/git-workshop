import { IClock } from '../../core/ports/IClock';
import { IProgressStore } from '../../core/ports/IProgressStore';
import { ISandboxManager } from '../../core/ports/ISandboxManager';
import { ParticipantProgress } from '../../core/domain/ParticipantProgress';

/**
 * Records a successful completion: bumps the completion count and drops the now-obsolete
 * resume snapshot. Counterpart to PauseExercise.
 */
export class CompleteExercise {
  constructor(
    private readonly sandboxes: ISandboxManager,
    private readonly progressStore: IProgressStore,
    private readonly clock: IClock,
  ) {}

  async execute(progress: ParticipantProgress, exerciseId: string): Promise<void> {
    progress.recordCompleted(exerciseId, this.clock.now());
    await this.sandboxes.removeSnapshot(exerciseId);
    await this.progressStore.save(progress);
  }
}

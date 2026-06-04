import { IClock } from '../../core/ports/IClock';
import { IProgressStore } from '../../core/ports/IProgressStore';
import { ISandboxManager } from '../../core/ports/ISandboxManager';
import { ParticipantProgress } from '../../core/domain/ParticipantProgress';
import { SessionContext } from '../SessionContext';

/**
 * Pauses an exercise attempt: snapshots its sandbox so it can be resumed later and records
 * the paused state (with the leftover timer budget). A completed attempt has nothing to
 * resume, so it is not snapshotted. Returns true when a resume snapshot was written.
 *
 * The Electron shell still owns the side effects it alone can do (kill the PTY, close the
 * watcher, dispose the live sandbox); this use case owns the persistable application logic.
 */
export class PauseExercise {
  constructor(
    private readonly sandboxes: ISandboxManager,
    private readonly progressStore: IProgressStore,
    private readonly clock: IClock,
  ) {}

  async execute(progress: ParticipantProgress, session: SessionContext, remainingMs: number | undefined): Promise<boolean> {
    if (session.progress.isComplete) return false;
    const id = session.exercise.id;
    const snapshot = await this.sandboxes.saveSnapshot(session.sandbox, id);
    progress.recordPaused(id, snapshot, session.progress.index, remainingMs, this.clock.now());
    await this.progressStore.save(progress);
    return true;
  }
}

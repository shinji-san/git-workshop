/**
 * Persisted learner progress, keyed by exercise UUID. Stored outside the repo
 * (e.g. ~/.git-workshop/progress.json) so it survives app updates.
 *
 * The display status is DERIVED, not stored: an exercise is "new" while its id is
 * not yet in `seenExerciseIds` (so exercises shipped by a later app version stand
 * out), "paused" while a resume snapshot exists, "completed" once finished at least
 * once, otherwise "not-started". Mutations take an explicit timestamp so the type
 * stays pure and testable (no hidden clock).
 */
export type ExerciseStatus = 'new' | 'not-started' | 'paused' | 'completed';

export interface ExerciseRecord {
  /** How often the exercise was completed successfully. */
  completedCount: number;
  /** Step index to resume at (paired with a snapshot). */
  lastStepIndex?: number;
  /** Path of the saved sandbox snapshot while paused; absent = not resumable. */
  snapshotPath?: string;
  /** Remaining timer milliseconds when paused (used by the timer feature). */
  remainingMs?: number;
  /** ISO timestamp of the last update. */
  updatedAt: string;
}

export interface ProgressData {
  version: number;
  /** App version that last wrote the file (for diagnostics/migration). */
  appVersion: string;
  /** Exercise ids the learner has already seen; ids missing here render as "new". */
  seenExerciseIds: string[];
  /** Ids of gated exercises the learner has unlocked with a code (sticky once unlocked). */
  unlockedIds: string[];
  exercises: { [id: string]: ExerciseRecord };
}

/** Per-exercise view the renderer needs to render its badges. */
export interface ExerciseStatusView {
  status: ExerciseStatus;
  completedCount: number;
  /** A resume snapshot exists -> the row continues instead of restarting. */
  resumable: boolean;
  /**
   * The exercise is gated and not yet unlocked -> the row shows 🔒 and cannot be opened. Determined
   * by the shell (it needs the exercise's `gated` flag + the trainer override), so the domain
   * defaults it to false and the SessionController fills the real value.
   */
  locked: boolean;
}

const CURRENT_VERSION = 1;

export class ParticipantProgress {
  constructor(private readonly data: ProgressData) {}

  static empty(appVersion: string): ParticipantProgress {
    return new ParticipantProgress({
      version: CURRENT_VERSION,
      appVersion,
      seenExerciseIds: [],
      unlockedIds: [],
      exercises: {},
    });
  }

  /** Build from a (possibly older/partial) on-disk object, tolerating missing fields. */
  static fromJSON(raw: Partial<ProgressData> | null | undefined, appVersion: string): ParticipantProgress {
    return new ParticipantProgress({
      version: CURRENT_VERSION,
      appVersion,
      seenExerciseIds: raw?.seenExerciseIds ?? [],
      unlockedIds: raw?.unlockedIds ?? [],
      exercises: raw?.exercises ?? {},
    });
  }

  toJSON(): ProgressData {
    return this.data;
  }

  /** Seed the seen-set with all currently known ids (used once, on first run). */
  seedSeen(ids: readonly string[]): void {
    this.data.seenExerciseIds = [...new Set(ids)];
  }

  markSeen(id: string): void {
    if (!this.data.seenExerciseIds.includes(id)) this.data.seenExerciseIds.push(id);
  }

  isUnlocked(id: string): boolean {
    return this.data.unlockedIds.includes(id);
  }

  /** Mark gated exercises as unlocked (sticky). New ids only; duplicates are ignored. */
  recordUnlocked(ids: readonly string[]): void {
    for (const id of ids) if (!this.data.unlockedIds.includes(id)) this.data.unlockedIds.push(id);
  }

  getRecord(id: string): ExerciseRecord | undefined {
    return this.data.exercises[id];
  }

  private touch(id: string): ExerciseRecord {
    const rec = this.data.exercises[id] ?? { completedCount: 0, updatedAt: '' };
    this.data.exercises[id] = rec;
    return rec;
  }

  recordPaused(id: string, snapshotPath: string, lastStepIndex: number, remainingMs: number | undefined, nowMs: number): void {
    const rec = this.touch(id);
    rec.snapshotPath = snapshotPath;
    rec.lastStepIndex = lastStepIndex;
    rec.remainingMs = remainingMs;
    rec.updatedAt = new Date(nowMs).toISOString();
  }

  recordCompleted(id: string, nowMs: number): void {
    const rec = this.touch(id);
    rec.completedCount += 1;
    rec.snapshotPath = undefined;
    rec.lastStepIndex = undefined;
    rec.remainingMs = undefined;
    rec.updatedAt = new Date(nowMs).toISOString();
  }

  /** Drop any resume snapshot reference (used on restart). */
  clearSnapshot(id: string, nowMs: number): void {
    const rec = this.touch(id);
    rec.snapshotPath = undefined;
    rec.lastStepIndex = undefined;
    rec.remainingMs = undefined;
    rec.updatedAt = new Date(nowMs).toISOString();
  }

  statusOf(id: string): ExerciseStatusView {
    const rec = this.data.exercises[id];
    const resumable = !!rec?.snapshotPath;
    // Priority: paused (a resumable attempt is in progress) > completed > new > not-started.
    // "paused" wins over "completed" so a finished exercise that is being redone and paused
    // shows ⏸ (and can be resumed), while a finished exercise with no live attempt shows ✓.
    let status: ExerciseStatus;
    if (resumable) status = 'paused';
    else if (rec && rec.completedCount > 0) status = 'completed';
    else if (!this.data.seenExerciseIds.includes(id)) status = 'new';
    else status = 'not-started';
    // `locked` defaults to false here; the shell overrides it (it knows the gated flag + override).
    return { status, completedCount: rec?.completedCount ?? 0, resumable, locked: false };
  }

  statusMap(ids: readonly string[]): { [id: string]: ExerciseStatusView } {
    const out: { [id: string]: ExerciseStatusView } = {};
    for (const id of ids) out[id] = this.statusOf(id);
    return out;
  }
}

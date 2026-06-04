import { describe, expect, it } from 'vitest';
import { PauseExercise } from '../../src/application/use-cases/PauseExercise';
import { CompleteExercise } from '../../src/application/use-cases/CompleteExercise';
import { SessionContext } from '../../src/application/SessionContext';
import { ExerciseProgress } from '../../src/core/domain/ExerciseProgress';
import { ParticipantProgress } from '../../src/core/domain/ParticipantProgress';
import { Exercise } from '../../src/core/domain/Exercise';
import { Sandbox, ISandboxManager } from '../../src/core/ports/ISandboxManager';
import { IProgressStore } from '../../src/core/ports/IProgressStore';
import { IClock } from '../../src/core/ports/IClock';
import { Verdict } from '../../src/core/domain/Verdict';

const ID = '069395e9-c941-4f61-ae94-574e6dad9232';
const NOW = 1_700_000_000_000;

const exercise: Exercise = {
  id: ID,
  chapter: '1.0',
  title: 'x',
  provisioning: { bundle: 'x.bundle' },
  steps: [
    { id: 's1', title: 's1', task: 't', goals: [{ type: 'headDetached' }] },
    { id: 's2', title: 's2', task: 't', goals: [{ type: 'headDetached' }] },
  ],
};
const sandbox: Sandbox = { id: 'sb', repoPath: '/tmp/x', env: {} };
const ok: Verdict = { satisfied: true, results: [] };

class FakeClock implements IClock {
  now() {
    return NOW;
  }
}

/** Records snapshot calls; the other methods are not exercised here. */
class FakeSandboxes implements ISandboxManager {
  saved: Array<{ key: string }> = [];
  removed: string[] = [];
  async create(): Promise<Sandbox> {
    return sandbox;
  }
  async reset(): Promise<Sandbox> {
    return sandbox;
  }
  async destroy(): Promise<void> {}
  async saveSnapshot(_s: Sandbox, key: string): Promise<string> {
    this.saved.push({ key });
    return `/snap/${key}`;
  }
  async createFromSnapshot(): Promise<Sandbox> {
    return sandbox;
  }
  async removeSnapshot(key: string): Promise<void> {
    this.removed.push(key);
  }
  async clearSnapshots(): Promise<void> {
    this.removed.push('*');
  }
}

class FakeStore implements IProgressStore {
  saves = 0;
  async load(): Promise<{ progress: ParticipantProgress; created: boolean }> {
    return { progress: ParticipantProgress.empty('1.0.0'), created: true };
  }
  async save(): Promise<void> {
    this.saves += 1;
  }
  async clear(): Promise<void> {}
}

function session(progress: ExerciseProgress): SessionContext {
  return new SessionContext(exercise, sandbox, progress, NOW);
}

describe('PauseExercise', () => {
  it('snapshots an in-progress attempt and records it as paused', async () => {
    const sandboxes = new FakeSandboxes();
    const store = new FakeStore();
    const progress = ParticipantProgress.empty('1.0.0');
    const uc = new PauseExercise(sandboxes, store, new FakeClock());

    const saved = await uc.execute(progress, session(ExerciseProgress.start(exercise)), 42_000);

    expect(saved).toBe(true);
    expect(sandboxes.saved).toEqual([{ key: ID }]);
    expect(store.saves).toBe(1);
    expect(progress.statusOf(ID).status).toBe('paused');
    expect(progress.getRecord(ID)).toMatchObject({ snapshotPath: `/snap/${ID}`, lastStepIndex: 0, remainingMs: 42_000 });
  });

  it('does not snapshot a completed attempt', async () => {
    const sandboxes = new FakeSandboxes();
    const store = new FakeStore();
    const progress = ParticipantProgress.empty('1.0.0');
    const done = ExerciseProgress.start(exercise);
    done.advance(ok);
    done.advance(ok); // both steps -> complete

    const saved = await new PauseExercise(sandboxes, store, new FakeClock()).execute(progress, session(done), undefined);

    expect(saved).toBe(false);
    expect(sandboxes.saved).toEqual([]);
    expect(store.saves).toBe(0);
    expect(progress.getRecord(ID)).toBeUndefined();
  });
});

describe('CompleteExercise', () => {
  it('records a completion and drops the resume snapshot', async () => {
    const sandboxes = new FakeSandboxes();
    const store = new FakeStore();
    const progress = ParticipantProgress.empty('1.0.0');
    progress.recordPaused(ID, '/snap/old', 1, undefined, NOW); // a stale snapshot exists

    await new CompleteExercise(sandboxes, store, new FakeClock()).execute(progress, ID);

    expect(sandboxes.removed).toEqual([ID]);
    expect(store.saves).toBe(1);
    expect(progress.statusOf(ID)).toMatchObject({ status: 'completed', completedCount: 1, resumable: false });
  });
});

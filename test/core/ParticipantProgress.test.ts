import { describe, expect, it } from 'vitest';
import { ParticipantProgress } from '../../src/core/domain/ParticipantProgress';

const NOW = 1_700_000_000_000;
const A = '8efce031-ff17-47e1-8bfe-94935d497059';
const B = 'a42d9ab6-12e4-439c-b6dd-6cc363945921';

describe('ParticipantProgress status derivation', () => {
  it('is "new" for an unseen id and "not-started" once seen', () => {
    const p = ParticipantProgress.empty('1.0.0');
    expect(p.statusOf(A).status).toBe('new');
    p.seedSeen([A]);
    expect(p.statusOf(A).status).toBe('not-started');
  });

  it('is "paused" while a snapshot exists, "completed" after finishing', () => {
    const p = ParticipantProgress.empty('1.0.0');
    p.seedSeen([A]);
    p.recordPaused(A, '/snap/A', 1, undefined, NOW);
    expect(p.statusOf(A)).toMatchObject({ status: 'paused', resumable: true });

    p.recordCompleted(A, NOW);
    expect(p.statusOf(A)).toMatchObject({ status: 'completed', completedCount: 1, resumable: false });
  });

  it('shows "paused" (not "completed") when a finished exercise is being redone and paused', () => {
    const p = ParticipantProgress.empty('1.0.0');
    p.recordCompleted(A, NOW); // finished once -> would be "completed"
    p.recordPaused(A, '/snap/A', 0, undefined, NOW); // restarted + paused -> live attempt
    expect(p.statusOf(A)).toMatchObject({ status: 'paused', resumable: true, completedCount: 1 });
  });

  it('counts repeated completions', () => {
    const p = ParticipantProgress.empty('1.0.0');
    p.recordCompleted(A, NOW);
    p.recordCompleted(A, NOW);
    expect(p.statusOf(A).completedCount).toBe(2);
  });

  it('clearSnapshot drops a pending resume', () => {
    const p = ParticipantProgress.empty('1.0.0');
    p.recordPaused(A, '/snap/A', 2, undefined, NOW);
    p.clearSnapshot(A, NOW);
    expect(p.getRecord(A)?.snapshotPath).toBeUndefined();
    expect(p.statusOf(A).resumable).toBe(false);
  });

  it('exposes the resume record (snapshot + step index)', () => {
    const p = ParticipantProgress.empty('1.0.0');
    p.recordPaused(A, '/snap/A', 3, undefined, NOW);
    expect(p.getRecord(A)).toMatchObject({ snapshotPath: '/snap/A', lastStepIndex: 3 });
  });

  it('statusMap returns a view per requested id', () => {
    const p = ParticipantProgress.empty('1.0.0');
    p.seedSeen([A]); // A known -> not-started; B unseen -> new
    const map = p.statusMap([A, B]);
    expect(map[A].status).toBe('not-started');
    expect(map[B].status).toBe('new');
  });

  it('survives a round-trip through toJSON/fromJSON', () => {
    const p = ParticipantProgress.empty('1.0.0');
    p.seedSeen([A]);
    p.recordCompleted(A, NOW);
    const restored = ParticipantProgress.fromJSON(p.toJSON(), '1.0.0');
    expect(restored.statusOf(A)).toMatchObject({ status: 'completed', completedCount: 1 });
  });

  it('tracks unlocked ids (sticky, deduped) and defaults statusOf().locked to false', () => {
    const p = ParticipantProgress.empty('1.0.0');
    expect(p.isUnlocked(A)).toBe(false);
    expect(p.statusOf(A).locked).toBe(false); // the shell decides real locking; domain default is false
    p.recordUnlocked([A, A]);
    expect(p.isUnlocked(A)).toBe(true);
    expect(p.toJSON().unlockedIds).toEqual([A]); // deduped
  });

  it('carries unlocked ids through toJSON/fromJSON', () => {
    const p = ParticipantProgress.empty('1.0.0');
    p.recordUnlocked([B]);
    const restored = ParticipantProgress.fromJSON(p.toJSON(), '1.0.0');
    expect(restored.isUnlocked(B)).toBe(true);
  });
});

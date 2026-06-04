import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { UnlockExercises } from '../../src/application/use-cases/UnlockExercises';
import { ParticipantProgress } from '../../src/core/domain/ParticipantProgress';
import { IExerciseRepository } from '../../src/core/ports/IExerciseRepository';
import { IProgressStore } from '../../src/core/ports/IProgressStore';

const GATED = randomUUID();

/** Repo stub whose matchUnlockCode returns GATED only for the "right" code. */
const repo: IExerciseRepository = {
  list: async () => [],
  load: async () => {
    throw new Error('not used');
  },
  matchUnlockCode: async (code) => (code.trim().toLowerCase() === 'right' ? [GATED] : []),
};

function fakeStore() {
  let saves = 0;
  const store: IProgressStore = {
    load: async () => ({ progress: ParticipantProgress.empty('t'), created: true }),
    save: async () => {
      saves += 1;
    },
    clear: async () => {},
  };
  return { store, saves: () => saves };
}

describe('UnlockExercises', () => {
  it('records and persists a matching code, returning the newly unlocked ids', async () => {
    const { store, saves } = fakeStore();
    const progress = ParticipantProgress.empty('t');
    const ids = await new UnlockExercises(repo, store).execute(progress, 'right');
    expect(ids).toEqual([GATED]);
    expect(progress.isUnlocked(GATED)).toBe(true);
    expect(saves()).toBe(1);
  });

  it('returns [] and does not save on a wrong code', async () => {
    const { store, saves } = fakeStore();
    const progress = ParticipantProgress.empty('t');
    const ids = await new UnlockExercises(repo, store).execute(progress, 'wrong');
    expect(ids).toEqual([]);
    expect(saves()).toBe(0);
  });

  it('returns [] (no re-save) when the match is already unlocked', async () => {
    const { store, saves } = fakeStore();
    const progress = ParticipantProgress.empty('t');
    progress.recordUnlocked([GATED]);
    const ids = await new UnlockExercises(repo, store).execute(progress, 'right');
    expect(ids).toEqual([]);
    expect(saves()).toBe(0);
  });
});
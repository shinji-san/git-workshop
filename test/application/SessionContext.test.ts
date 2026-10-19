import { describe, expect, it } from 'vitest';
import { SessionContext } from '../../src/application/SessionContext';
import { RelocalizeExercise } from '../../src/application/use-cases/RelocalizeExercise';
import { ExerciseProgress } from '../../src/core/domain/ExerciseProgress';
import { Exercise } from '../../src/core/domain/Exercise';
import { IExerciseRepository } from '../../src/core/ports/IExerciseRepository';
import { Sandbox } from '../../src/core/ports/ISandboxManager';
import { Locale } from '../../src/core/i18n/Locale';

const ID = '4d2f3e0a-9f3e-4c6f-8c2d-1b9a5e7d6c21';
const sandbox: Sandbox = { id: 'sb', repoPath: '/tmp/x', env: {} };

const exercise = (locale: Locale, contentLocale: Locale = locale): Exercise => ({
  id: ID,
  locale,
  contentLocale,
  chapter: '1.0',
  title: locale === 'de-DE' ? 'Titel' : 'Title',
  provisioning: {},
  steps: [
    { id: 's1', title: `s1-${locale}`, task: 't', goals: [{ type: 'headDetached' }], hints: ['h1', 'h2'] },
    { id: 's2', title: `s2-${locale}`, task: 't', goals: [{ type: 'headDetached' }] },
  ],
});

describe('SessionContext.relocalized', () => {
  it('keeps sandbox, step index, revealed hints and reported pitfalls – only the texts change', () => {
    const ctx = new SessionContext(exercise('de-DE'), sandbox, ExerciseProgress.start(exercise('de-DE')), 1000);
    ctx.progress.advance({ satisfied: true, results: [] });
    ctx.revealedHints = 1;
    ctx.matchedPitfalls.add('detached');
    ctx.lastProgressAt = 5000;

    const next = SessionContext.relocalized(ctx, exercise('en-US', 'de-DE'));

    expect(next.sandbox).toBe(sandbox);
    expect(next.progress.index).toBe(1);
    expect(next.progress.currentStep.title).toBe('s2-en-US');
    expect(next.revealedHints).toBe(1);
    expect(next.matchedPitfalls).toEqual(new Set(['detached']));
    expect(next.lastProgressAt).toBe(5000);
    expect(next.exercise.contentLocale).toBe('de-DE');
  });
});

describe('RelocalizeExercise', () => {
  const repo = (served: Locale): IExerciseRepository => ({
    list: async () => [],
    load: async (_id, locale, contentLocale) => exercise(served, contentLocale ?? locale),
    matchUnlockCode: async () => [],
  });

  it('reloads with the session content locale and returns a new context', async () => {
    const ctx = new SessionContext(exercise('de-DE'), sandbox, ExerciseProgress.start(exercise('de-DE')), 0);
    const next = await new RelocalizeExercise(repo('en-US')).execute(ctx, 'en-US');
    expect(next).not.toBe(ctx);
    expect(next.exercise.locale).toBe('en-US');
    expect(next.exercise.contentLocale).toBe('de-DE');
  });

  it('returns the same context when the texts resolve to the current locale anyway', async () => {
    const ctx = new SessionContext(exercise('de-DE'), sandbox, ExerciseProgress.start(exercise('de-DE')), 0);
    const next = await new RelocalizeExercise(repo('de-DE')).execute(ctx, 'fr-FR'); // falls back to de-DE
    expect(next).toBe(ctx);
  });
});

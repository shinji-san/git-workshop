import { describe, expect, it } from 'vitest';
import { ExerciseProgress } from '../../src/core/domain/ExerciseProgress';
import { Exercise } from '../../src/core/domain/Exercise';
import { Verdict } from '../../src/core/domain/Verdict';

const ex: Exercise = {
  id: 'x',
  chapter: '1.0',
  title: 'x',
  provisioning: { bundle: 'x.bundle' },
  steps: [
    { id: 's1', title: 's1', task: 't', goals: [{ type: 'headDetached' }] },
    { id: 's2', title: 's2', task: 't', goals: [{ type: 'headDetached' }] },
  ],
};
const ok: Verdict = { satisfied: true, results: [] };
const no: Verdict = { satisfied: false, results: [] };

describe('ExerciseProgress', () => {
  it('starts at the first step', () => {
    const p = ExerciseProgress.start(ex);
    expect(p.index).toBe(0);
    expect(p.currentStep.id).toBe('s1');
    expect(p.isComplete).toBe(false);
  });

  it('advances on a satisfied verdict', () => {
    const p = ExerciseProgress.start(ex);
    p.advance(ok);
    expect(p.currentStep.id).toBe('s2');
  });

  it('does NOT advance on an unsatisfied verdict', () => {
    const p = ExerciseProgress.start(ex);
    p.advance(no);
    expect(p.index).toBe(0);
  });

  it('becomes complete after the last step', () => {
    const p = ExerciseProgress.start(ex);
    p.advance(ok);
    p.advance(ok);
    expect(p.isComplete).toBe(true);
    expect(() => p.currentStep).toThrow();
  });

  it('resumeAt positions at a reached step and clamps out-of-range indices', () => {
    expect(ExerciseProgress.resumeAt(ex, 1).currentStep.id).toBe('s2');
    expect(ExerciseProgress.resumeAt(ex, -5).index).toBe(0);
    expect(ExerciseProgress.resumeAt(ex, 99).isComplete).toBe(true); // clamped to stepCount
  });
});

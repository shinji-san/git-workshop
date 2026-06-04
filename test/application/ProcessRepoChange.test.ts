import { describe, expect, it } from 'vitest';
import { ProcessRepoChange } from '../../src/application/use-cases/ProcessRepoChange';
import { SessionContext } from '../../src/application/SessionContext';
import { ExerciseProgress } from '../../src/core/domain/ExerciseProgress';
import { Exercise } from '../../src/core/domain/Exercise';
import { RepoState } from '../../src/core/domain/RepoState';
import { IGitInspector } from '../../src/core/ports/IGitInspector';
import { IClock } from '../../src/core/ports/IClock';
import { Sandbox } from '../../src/core/ports/ISandboxManager';

const exercise: Exercise = {
  id: 'x',
  chapter: '1.0',
  title: 'x',
  provisioning: { bundle: 'x.bundle' },
  commonPitfalls: [
    { id: 'detached', when: [{ type: 'headDetached' }], severity: 'warning', message: 'detached' },
  ],
  steps: [
    {
      id: 's1',
      title: 'create branch',
      task: 't',
      goals: [{ type: 'branchExists', name: 'feature' }],
      hints: ['first hint', 'second hint'],
    },
    { id: 's2', title: 'done', task: 't', goals: [{ type: 'headDetached' }] },
  ],
};

const sandbox: Sandbox = { id: 'sb', repoPath: '/tmp/x', env: {} };

class FakeClock implements IClock {
  constructor(public t = 0) {}
  now() {
    return this.t;
  }
}

class FakeInspector implements IGitInspector {
  constructor(private state: RepoState) {}
  set(state: RepoState) {
    this.state = state;
  }
  async snapshot(): Promise<RepoState> {
    return this.state;
  }
}

const emptyExtras = { objects: [], index: [], commands: [] } as const;
const empty: RepoState = { commits: [], refs: [], head: { kind: 'attached', branch: 'main', oid: 'a' }, worktree: [], config: {}, ...emptyExtras };
const withBranch: RepoState = {
  commits: [],
  refs: [{ name: 'feature', fullName: 'refs/heads/feature', kind: 'branch', oid: 'a' }],
  head: { kind: 'attached', branch: 'feature', oid: 'a' },
  worktree: [],
  config: {},
  ...emptyExtras,
};
const detached: RepoState = { commits: [], refs: [], head: { kind: 'detached', oid: 'a' }, worktree: [], config: {}, ...emptyExtras };

function ctx(clock: FakeClock): SessionContext {
  return new SessionContext(exercise, sandbox, ExerciseProgress.start(exercise), clock.now());
}

describe('ProcessRepoChange', () => {
  it('advances and then reports the NEXT step\'s still-pending goal', async () => {
    const clock = new FakeClock(0);
    const git = new FakeInspector(withBranch);
    const uc = new ProcessRepoChange(git, clock);
    const c = ctx(clock);
    const res = await uc.execute(c);
    expect(res.advanced).toBe(true);
    expect(c.progress.currentStep.id).toBe('s2');
    // The broadcast verdict must describe step 2 (still to do), not the finished step 1.
    expect(res.verdict.satisfied).toBe(false);
    expect(res.verdict.results.map((r) => r.assertion.type)).toEqual(['headDetached']);
  });

  it('advances through multiple satisfied steps in a single tick', async () => {
    const twoDetached: Exercise = {
      id: 'x',
      chapter: '1.0',
      title: 'x',
      provisioning: { bundle: 'x.bundle' },
      steps: [
        { id: 'a', title: 'a', task: 't', goals: [{ type: 'headDetached' }] },
        { id: 'b', title: 'b', task: 't', goals: [{ type: 'headDetached' }] },
      ],
    };
    const clock = new FakeClock(0);
    const git = new FakeInspector(detached);
    const uc = new ProcessRepoChange(git, clock);
    const c = new SessionContext(twoDetached, sandbox, ExerciseProgress.start(twoDetached), clock.now());
    const res = await uc.execute(c);
    expect(res.advanced).toBe(true);
    expect(res.isComplete).toBe(true);
  });

  it('does not advance and auto-reveals a hint when stuck', async () => {
    const clock = new FakeClock(0);
    const git = new FakeInspector(empty);
    const uc = new ProcessRepoChange(git, clock);
    const c = ctx(clock);

    const first = await uc.execute(c);
    expect(first.advanced).toBe(false);
    expect(first.revealedHint).toBeUndefined();

    clock.t = 100_000; // above the 90s threshold
    const second = await uc.execute(c);
    expect(second.revealedHint).toBe('first hint');
  });

  it('edge-triggers pitfalls: report only on transition', async () => {
    const clock = new FakeClock(0);
    const git = new FakeInspector(detached);
    const uc = new ProcessRepoChange(git, clock);
    const c = ctx(clock);

    const first = await uc.execute(c);
    expect(first.newPitfalls.map((p) => p.id)).toEqual(['detached']);

    const second = await uc.execute(c); // still detached -> do not report again
    expect(second.newPitfalls).toHaveLength(0);
  });
});

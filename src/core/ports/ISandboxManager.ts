import { Exercise } from '../domain/Exercise';

/** An isolated sandbox: working directory + environment, used by both PTY and inspector. */
export interface Sandbox {
  readonly id: string;
  readonly repoPath: string;
  readonly env: NodeJS.ProcessEnv;
}

export interface ISandboxManager {
  create(exercise: Exercise): Promise<Sandbox>;
  reset(sandbox: Sandbox, exercise: Exercise): Promise<Sandbox>;
  destroy(sandbox: Sandbox): Promise<void>;
  /** Save a copy of the sandbox repo as a resume snapshot under `key`; returns its path. */
  saveSnapshot(sandbox: Sandbox, key: string): Promise<string>;
  /** Create a fresh sandbox seeded from a previously saved snapshot. */
  createFromSnapshot(snapshotPath: string): Promise<Sandbox>;
  /** Delete a resume snapshot (no-op if absent). */
  removeSnapshot(key: string): Promise<void>;
  /** Delete ALL resume snapshots (used when resetting participant progress). */
  clearSnapshots(): Promise<void>;
}

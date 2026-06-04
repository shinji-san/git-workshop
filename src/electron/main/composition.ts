import * as os from 'node:os';
import * as path from 'node:path';
import { GitRunner } from '../../infrastructure/git/GitRunner';
import { ShellRunner } from '../../infrastructure/git/ShellRunner';
import { GitInspector } from '../../infrastructure/git/GitInspector';
import { SandboxManager } from '../../infrastructure/sandbox/SandboxManager';
import { FileExerciseRepository } from '../../infrastructure/exercise/FileExerciseRepository';
import { FileProgressStore } from '../../infrastructure/progress/FileProgressStore';
import { SystemClock } from '../../infrastructure/SystemClock';
import { StartExercise } from '../../application/use-cases/StartExercise';
import { ResumeExercise } from '../../application/use-cases/ResumeExercise';
import { PauseExercise } from '../../application/use-cases/PauseExercise';
import { CompleteExercise } from '../../application/use-cases/CompleteExercise';
import { ProcessRepoChange } from '../../application/use-cases/ProcessRepoChange';
import { ResetExercise } from '../../application/use-cases/ResetExercise';
import { RequestHint } from '../../application/use-cases/RequestHint';
import { UnlockExercises } from '../../application/use-cases/UnlockExercises';

export interface AppConfig {
  /** Root folder containing the exercise packages. */
  readonly exercisesRoot: string;
  /** Optional bin path of the bundled toolchain (Git for Windows Portable or similar). */
  readonly toolchainBin?: string;
  /** Optional path to the git binary. */
  readonly gitBin?: string;
  /** Path to the persisted progress JSON. */
  readonly progressFile: string;
  /** Directory holding resume snapshots. */
  readonly snapshotRoot: string;
  /** Running app version (stored in the progress file). */
  readonly appVersion: string;
}

/**
 * Composition root: the ONLY place that knows and wires concrete infrastructure.
 * Everything behind it depends only on ports.
 */
export function composeApp(config: AppConfig) {
  const git = new GitRunner(config.gitBin);
  const shell = new ShellRunner();
  const clock = new SystemClock();

  const inspector = new GitInspector(git);
  const sandboxes = new SandboxManager(git, shell, config.toolchainBin, undefined, config.snapshotRoot);
  const repo = new FileExerciseRepository(config.exercisesRoot);
  const progressStore = new FileProgressStore(config.progressFile, config.appVersion);

  return {
    sandboxes,
    progressStore,
    startExercise: new StartExercise(repo, sandboxes, clock),
    resumeExercise: new ResumeExercise(repo, sandboxes, clock),
    pauseExercise: new PauseExercise(sandboxes, progressStore, clock),
    completeExercise: new CompleteExercise(sandboxes, progressStore, clock),
    processRepoChange: new ProcessRepoChange(inspector, clock),
    resetExercise: new ResetExercise(sandboxes, clock),
    requestHint: new RequestHint(),
    unlockExercises: new UnlockExercises(repo, progressStore),
    listExercises: () => repo.list(),
  };
}

/** The wired services returned by composeApp – the controller depends on this shape. */
export type AppServices = ReturnType<typeof composeApp>;

export const defaultExercisesRoot = (appRoot: string) => path.join(appRoot, 'exercises');

/** Per-user data directory for progress + snapshots (lives in the home directory). */
export const defaultDataDir = () => path.join(os.homedir(), '.git-workshop');

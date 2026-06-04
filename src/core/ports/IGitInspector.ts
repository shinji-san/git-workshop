import { RepoState } from '../domain/RepoState';

/** Reads the full repo state (including orphaned commits) via plumbing. */
export interface IGitInspector {
  snapshot(repoPath: string, env: NodeJS.ProcessEnv): Promise<RepoState>;
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { IGitInspector } from '../../core/ports/IGitInspector';
import { GitCommand, HeadState, RepoState } from '../../core/domain/RepoState';
import { GitRunner } from './GitRunner';
import {
  parseAllCommitOids,
  parseAllObjects,
  parseCatFileBatch,
  parseConfigList,
  parseIndex,
  parseOidList,
  parseRefs,
  parseStatusV2,
  toCommitNodes,
} from './parsers';
import { parseTrace2Commands } from './trace2';
import { TRACE2_FILE } from '../sandbox/env';

/**
 * Builds the full RepoState from plumbing commands.
 * Reads the DAG exactly once per tick -> all topological assertions then become
 * pure graph computations. Orphans arise from the difference "all objects"
 * minus "reachable from refs".
 */
export class GitInspector implements IGitInspector {
  constructor(private readonly git: GitRunner) {}

  async snapshot(repoPath: string, env: NodeJS.ProcessEnv): Promise<RepoState> {
    const o = { cwd: repoPath, env };

    // The directory may not be a git repository yet (e.g. a `git init` exercise before
    // init). Detect that up front and return an empty "no repo" state instead of letting
    // the plumbing commands below throw.
    const isRepo = await this.git
      .run(['rev-parse', '--is-inside-work-tree'], o)
      .then((out) => out.trim() === 'true')
      .catch(() => false);
    if (!isRepo) {
      // Even before `git init`, the shell may have run git commands – keep the trace.
      return { commits: [], refs: [], head: { kind: 'none' }, worktree: [], config: {}, objects: [], index: [], commands: this.readCommands(env) };
    }

    const [allObjectsOut, reachableOut, refsOut, statusOut, configOut, indexOut, head] = await Promise.all([
      this.git.run(['cat-file', '--batch-all-objects', '--unordered', '--batch-check=%(objecttype) %(objectname)'], o),
      this.git.run(['rev-list', '--all', 'HEAD'], o).catch(() => ''),
      // %00 is git's token for a NUL byte in the OUTPUT; a literal \x00 in the
      // argument is rejected by Node (spawn) with ERR_INVALID_ARG_VALUE. The parser
      // then splits the output on the actual NUL character.
      this.git.run(['for-each-ref', '--format=%(objectname)%00%(refname)%00%(objecttype)%00%(*objectname)'], o),
      this.git.run(['status', '--porcelain=v2', '-z'], o),
      this.git.run(['config', '--list', '-z'], o).catch(() => ''),
      this.git.run(['ls-files', '--stage', '-z'], o).catch(() => ''),
      this.readHead(repoPath, env),
    ]);

    const commitOids = parseAllCommitOids(allObjectsOut);
    const batchOut =
      commitOids.length > 0
        ? await this.git.run(['cat-file', '--batch'], { ...o, stdin: commitOids.join('\n') + '\n' })
        : '';

    const reachable = parseOidList(reachableOut);
    const commits = toCommitNodes(parseCatFileBatch(batchOut), reachable);
    const refs = parseRefs(refsOut);
    const worktree = parseStatusV2(statusOut);
    const config = parseConfigList(configOut);
    const objects = parseAllObjects(allObjectsOut);
    const index = parseIndex(indexOut);

    return { commits, refs, head, worktree, config, objects, index, commands: this.readCommands(env) };
  }

  /**
   * Reads the participant's git commands from the GIT_TRACE2 log in the sandbox HOME.
   * Best-effort: a missing file (no command run yet) yields an empty list.
   */
  private readCommands(env: NodeJS.ProcessEnv): GitCommand[] {
    if (!env.HOME) return [];
    try {
      return parseTrace2Commands(fs.readFileSync(path.join(env.HOME, TRACE2_FILE), 'utf8'));
    } catch {
      return [];
    }
  }

  private async readHead(repoPath: string, env: NodeJS.ProcessEnv): Promise<HeadState> {
    const o = { cwd: repoPath, env };
    const branch = (await this.git.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], o).catch(() => '')).trim();
    const oid = (await this.git.run(['rev-parse', '--verify', '--quiet', 'HEAD'], o).catch(() => '')).trim();
    if (branch && oid) return { kind: 'attached', branch, oid };
    if (branch && !oid) return { kind: 'unborn', branch };
    return { kind: 'detached', oid };
  }
}

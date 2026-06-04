import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ISandboxManager, Sandbox } from '../../core/ports/ISandboxManager';
import { Exercise } from '../../core/domain/Exercise';
import { GitRunner } from '../git/GitRunner';
import { ShellRunner } from '../git/ShellRunner';
import { buildSandboxEnv, renderBashProfile, renderBashrc, renderGitConfig, SandboxIdentity, TRACE2_FILE } from './env';

const IDENTITY: SandboxIdentity = { name: 'Workshop-Teilnehmer', email: 'workshop@local' };

/**
 * Provisions and manages isolated sandboxes.
 * Separation of concerns: spawning/file system is bundled here; the pure
 * parts (env, gitconfig) live in env.ts and are tested there.
 */
export class SandboxManager implements ISandboxManager {
  private readonly root: string;
  private readonly snapshotRoot: string;

  constructor(
    private readonly git: GitRunner,
    private readonly shell: ShellRunner,
    private readonly toolchainBin?: string,
    rootDir?: string,
    snapshotRoot?: string,
  ) {
    this.root = rootDir ?? path.join(os.tmpdir(), 'git-workshop');
    this.snapshotRoot = snapshotRoot ?? path.join(os.homedir(), '.git-workshop', 'snapshots');
  }

  /** Call on app start: sweep out orphaned temp directories left after a crash. */
  async sweep(): Promise<void> {
    await fs.rm(this.root, { recursive: true, force: true });
    await fs.mkdir(this.root, { recursive: true });
  }

  async create(exercise: Exercise): Promise<Sandbox> {
    const s = await this.newSandboxDir();
    await this.provision(exercise, s.repoPath, s.dir, s.env);
    return { id: s.id, repoPath: s.repoPath, env: s.env };
  }

  async saveSnapshot(sandbox: Sandbox, key: string): Promise<string> {
    const dest = path.join(this.snapshotRoot, key);
    await fs.rm(dest, { recursive: true, force: true });
    await fs.mkdir(this.snapshotRoot, { recursive: true });
    // Copy the WHOLE sandbox dir (HOME), not just repo/: an exercise may create sibling repos
    // outside the worktree -> e.g. a bare remote at ../remote.git. Capturing the whole dir keeps
    // the relative layout intact, so relative remote URLs (../remote.git) still resolve on resume.
    // (repo/ itself carries its full state: worktree + .git refs/objects/index.)
    await fs.cp(path.dirname(sandbox.repoPath), dest, { recursive: true });
    return dest;
  }

  async createFromSnapshot(snapshotPath: string): Promise<Sandbox> {
    const s = await this.newSandboxDir();
    // Seed the whole sandbox dir from the snapshot (repo/ plus any sibling repos, e.g. ../remote.git),
    // preserving the relative layout. fs.cp merges the snapshot's contents into the fresh dir.
    await fs.cp(snapshotPath, s.dir, { recursive: true });
    // Re-generate the HOME-level config (deterministic -> also picks up app updates since the pause)
    // and drop the carried-over command trace so the resumed session starts with a clean GIT_TRACE2 log.
    await this.writeHomeConfig(s.dir);
    await fs.rm(path.join(s.dir, TRACE2_FILE), { force: true });
    return { id: s.id, repoPath: s.repoPath, env: s.env };
  }

  async removeSnapshot(key: string): Promise<void> {
    await fs.rm(path.join(this.snapshotRoot, key), { recursive: true, force: true });
  }

  /** Delete ALL resume snapshots (used when resetting participant progress). */
  async clearSnapshots(): Promise<void> {
    await fs.rm(this.snapshotRoot, { recursive: true, force: true });
  }

  /** Create a fresh sandbox directory with env + shell config, but no repo yet. */
  private async newSandboxDir(): Promise<{ id: string; dir: string; env: NodeJS.ProcessEnv; repoPath: string }> {
    const id = randomUUID();
    const dir = path.join(this.root, id);
    await fs.mkdir(dir, { recursive: true });
    const env = buildSandboxEnv(dir, this.toolchainBin);
    await this.writeHomeConfig(dir);
    return { id, dir, env, repoPath: path.join(dir, 'repo') };
  }

  /** Write the deterministic HOME-level files (gitconfig + shell rc) into a sandbox dir. HOME points
   *  into this sandbox, so the git-aware prompt and isolated config live here. */
  private async writeHomeConfig(dir: string): Promise<void> {
    await fs.writeFile(path.join(dir, '.gitconfig'), renderGitConfig(IDENTITY), 'utf8');
    await fs.writeFile(path.join(dir, '.bashrc'), renderBashrc(), 'utf8');
    await fs.writeFile(path.join(dir, '.bash_profile'), renderBashProfile(), 'utf8');
  }

  async reset(sandbox: Sandbox, exercise: Exercise): Promise<Sandbox> {
    // clone-then-swap: fresh into a sibling directory, then replace the old repo
    const dir = path.dirname(sandbox.repoPath);
    const tmpRepo = path.join(dir, `repo-${randomUUID()}`);
    await this.provision(exercise, tmpRepo, dir, sandbox.env);
    await fs.rm(sandbox.repoPath, { recursive: true, force: true });
    await fs.rename(tmpRepo, sandbox.repoPath);
    return sandbox;
  }

  async destroy(sandbox: Sandbox): Promise<void> {
    await fs.rm(path.dirname(sandbox.repoPath), { recursive: true, force: true });
  }

  private async provision(
    exercise: Exercise,
    repoPath: string,
    cwd: string,
    env: NodeJS.ProcessEnv,
  ): Promise<void> {
    const { bundle, keepOrigin, setup } = exercise.provisioning;

    if (bundle) {
      // Verify the bundle before cloning – offline you cannot just "re-fetch" it.
      // `git bundle verify` needs a repository context (it checks prerequisites
      // against an object store). The target folder does not exist yet and `cwd` is
      // not a repo -> verify inside a throwaway empty repo.
      const verifyDir = path.join(cwd, '.verify');
      await this.git.run(['init', '-q', verifyDir], { cwd, env });
      try {
        await this.git.run(['bundle', 'verify', bundle], { cwd: verifyDir, env });
      } finally {
        await fs.rm(verifyDir, { recursive: true, force: true });
      }
      await this.git.run(['clone', bundle, repoPath], { cwd, env });

      // `git clone` only creates a local branch for the HEAD branch; further
      // branches of the bundle stay as origin/<name>. Create local branches so
      // exercises can address them by name AND they survive an origin removal.
      await this.materializeBranches(repoPath, env);

      if (!keepOrigin) {
        await this.git.run(['remote', 'remove', 'origin'], { cwd: repoPath, env });
      }
    } else {
      // No bundle: start as an empty, non-git directory (e.g. for a `git init` exercise).
      await fs.mkdir(repoPath, { recursive: true });
    }

    // Optional setup script: trusted author content, runs in the sandbox shell.
    for (const line of setup ?? []) {
      await this.shell.run(line, { cwd: repoPath, env });
    }
  }

  /** Create a local branch of the same name for each origin/<name> (excluding HEAD and
   *  already-existing ones). lstrip strips the ref prefixes deterministically. */
  private async materializeBranches(repoPath: string, env: NodeJS.ProcessEnv): Promise<void> {
    const o = { cwd: repoPath, env };
    const remoteOut = await this.git.run(
      ['for-each-ref', '--format=%(refname:lstrip=3)', 'refs/remotes/origin'],
      o,
    );
    const localOut = await this.git.run(['for-each-ref', '--format=%(refname:lstrip=2)', 'refs/heads'], o);
    const local = new Set(localOut.split('\n').map((s) => s.trim()).filter(Boolean));
    for (const name of remoteOut.split('\n').map((s) => s.trim()).filter(Boolean)) {
      if (name === 'HEAD' || local.has(name)) continue;
      await this.git.run(['branch', name, `refs/remotes/origin/${name}`], o);
    }
  }
}

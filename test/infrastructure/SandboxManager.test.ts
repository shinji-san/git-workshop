import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { SandboxManager } from '../../src/infrastructure/sandbox/SandboxManager';
import { GitRunner } from '../../src/infrastructure/git/GitRunner';
import { ShellRunner } from '../../src/infrastructure/git/ShellRunner';
import { TRACE2_FILE } from '../../src/infrastructure/sandbox/env';

// saveSnapshot/createFromSnapshot touch only the filesystem (no git/shell), so the runners are stubs.
describe('SandboxManager snapshots', () => {
  let base: string;
  let root: string;
  let mgr: SandboxManager;

  beforeEach(async () => {
    base = path.join(os.tmpdir(), 'gw-sbmgr-test', randomUUID());
    root = path.join(base, 'root');
    await fs.mkdir(root, { recursive: true });
    mgr = new SandboxManager({} as GitRunner, {} as ShellRunner, undefined, root, path.join(base, 'snap'));
  });

  afterEach(async () => {
    await fs.rm(base, { recursive: true, force: true });
  });

  it('snapshots a sibling repo (../remote.git) and restores the relative layout', async () => {
    // Build a sandbox dir by hand: repo/ (worktree) + a sibling bare remote + HOME-level files.
    const dir = path.join(root, randomUUID());
    const repoPath = path.join(dir, 'repo');
    await fs.mkdir(repoPath, { recursive: true });
    await fs.mkdir(path.join(dir, 'remote.git'), { recursive: true });
    await fs.writeFile(path.join(repoPath, 'feature.js'), 'x', 'utf8');
    await fs.writeFile(path.join(dir, 'remote.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    await fs.writeFile(path.join(dir, '.gitconfig'), 'OLD', 'utf8'); // stale HOME config
    await fs.writeFile(path.join(dir, TRACE2_FILE), '{"old":true}\n', 'utf8'); // stale command trace

    const snap = await mgr.saveSnapshot({ id: 'x', repoPath, env: {} }, 'ex-1');
    const restored = await mgr.createFromSnapshot(snap);
    const rdir = path.dirname(restored.repoPath);

    // The sibling bare remote survived, as a sibling of repo/ -> ../remote.git keeps resolving.
    expect(await fs.readFile(path.join(rdir, 'remote.git', 'HEAD'), 'utf8')).toContain('refs/heads/main');
    // The worktree content survived too.
    expect(await fs.readFile(path.join(restored.repoPath, 'feature.js'), 'utf8')).toBe('x');
    // The HOME config was regenerated (not the stale 'OLD').
    expect(await fs.readFile(path.join(rdir, '.gitconfig'), 'utf8')).not.toBe('OLD');
    // The carried-over command trace was dropped (clean GIT_TRACE2 log on resume).
    await expect(fs.access(path.join(rdir, TRACE2_FILE))).rejects.toThrow();
  });
});
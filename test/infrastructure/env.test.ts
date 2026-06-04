import { describe, expect, it } from 'vitest';
import { buildSandboxEnv, renderBashProfile, renderBashrc, renderGitConfig } from '../../src/infrastructure/sandbox/env';

describe('buildSandboxEnv', () => {
  it('isolates config and home, prepends the toolchain to PATH', () => {
    const env = buildSandboxEnv('/tmp/sb', '/opt/tool/bin', { PATH: '/usr/bin' });
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(env.GIT_CONFIG_GLOBAL).toContain('/tmp/sb');
    expect(env.HOME).toBe('/tmp/sb');
    expect(env.LC_ALL).toBe('C');
    expect(env.PATH!.startsWith('/opt/tool/bin')).toBe(true);
  });
});

describe('renderGitConfig', () => {
  it('disables gc.auto and uses a real editor', () => {
    const cfg = renderGitConfig({ name: 'T', email: 't@x' }, 'vim');
    expect(cfg).toContain('auto = 0');
    expect(cfg).toContain('quotepath = false');
    expect(cfg).toContain('editor = vim');
  });
});

describe('renderBashrc', () => {
  it('sets a git-aware prompt and handles a detached HEAD', () => {
    const rc = renderBashrc();
    expect(rc).toContain('PS1=');
    expect(rc).toContain('__ws_git_branch');
    expect(rc).toContain('symbolic-ref --short -q HEAD');
    expect(rc).toContain('detached');
  });

  it('switches the interactive shell to a UTF-8 locale (so umlauts can be typed)', () => {
    const rc = renderBashrc();
    expect(rc).toContain('export LC_ALL=C.UTF-8');
    expect(rc).toContain('locale -a');
  });

  it('the .bash_profile sources the .bashrc (login shell)', () => {
    expect(renderBashProfile()).toContain('.bashrc');
  });
});

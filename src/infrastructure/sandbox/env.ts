import * as path from 'node:path';

/**
 * File (under the sandbox HOME, i.e. OUTSIDE the repo worktree) the interactive shell writes
 * its GIT_TRACE2 events to. Single source shared by the bashrc export (writer), the
 * GitInspector (reader) and the SessionController (watches it so read-only commands tick).
 */
export const TRACE2_FILE = 'trace2.jsonl';

export interface SandboxIdentity {
  readonly name: string;
  readonly email: string;
}

/**
 * Pure function: builds the isolated environment for a sandbox.
 * This env is used by both the PTY and the GitInspector -> a single source of isolation.
 *
 * - GIT_CONFIG_* encapsulates the configuration; the participant's real config never leaks in.
 * - HOME points into the sandbox (vim & co. write there, not into the real home directory).
 * - PATH prepends the bundled toolchain (git/bash/cat/ls/grep/vim).
 * - LC_ALL=C makes the output locale-independent for the inspector.
 */
export function buildSandboxEnv(
  sandboxDir: string,
  toolchainBin: string | undefined,
  parentEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const sep = path.delimiter;
  const basePath = parentEnv.PATH ?? '';
  const env: NodeJS.ProcessEnv = {
    ...parentEnv,
    HOME: sandboxDir,
    USERPROFILE: sandboxDir,
    GIT_CONFIG_GLOBAL: path.join(sandboxDir, '.gitconfig'),
    GIT_CONFIG_SYSTEM: path.join(sandboxDir, '.gitconfig.system'),
    GIT_CONFIG_NOSYSTEM: '1',
    LC_ALL: 'C',
    PATH: toolchainBin ? `${toolchainBin}${sep}${basePath}` : basePath,
  };
  return env;
}

/**
 * Pure function: produces the contents of the sandbox .gitconfig.
 * gc.auto=0 prevents orphaned objects (used by the orphan exercises) from being garbage-collected;
 * core.quotepath=false gives deterministic path output; core.editor is a REAL editor,
 * because the PTY can host interactive programs.
 */
export function renderGitConfig(identity: SandboxIdentity, editor = 'nano'): string {
  return [
    '[user]',
    `\tname = ${identity.name}`,
    `\temail = ${identity.email}`,
    '[init]',
    '\tdefaultBranch = main',
    '[gc]',
    '\tauto = 0',
    '[core]',
    '\tquotepath = false',
    `\teditor = ${editor}`,
    '\tlongpaths = true',
    '[advice]',
    '\tdetachedHead = false',
    '',
  ].join('\n');
}

/**
 * Pure function: produces the .bashrc of the sandbox shell with a git-aware prompt.
 * Deliberately self-contained (no git-prompt.sh) so it works air-gapped without further
 * toolchain files. Shows the current branch in parentheses; on a detached HEAD it shows
 * "detached <short OID>" instead – fitting the workshop theme (the detached-HEAD pitfall).
 */
export function renderBashrc(): string {
  return [
    '# Git-Workshop Sandbox-Shell (generiert)',
    '# The shared sandbox env uses LC_ALL=C for deterministic inspector output. The INTERACTIVE',
    '# shell instead needs a UTF-8 locale so umlauts/multibyte input work (readline + editors).',
    '# Bash re-runs setlocale immediately when LC_ALL is assigned. Prefer C.UTF-8, else any UTF-8.',
    "if locale -a 2>/dev/null | grep -qiE '^C\\.utf-?8$'; then",
    '  export LC_ALL=C.UTF-8',
    'else',
    "  _ws_utf8=$(locale -a 2>/dev/null | grep -iE 'utf-?8' | head -n1)",
    '  export LC_ALL="${_ws_utf8:-C.UTF-8}"',
    '  unset _ws_utf8',
    'fi',
    '# Log every git invocation of this interactive shell (plumbing check B). The file lives',
    "# under HOME (= the sandbox dir, outside the repo worktree), so it is invisible to the",
    '# inspector\'s worktree checks. The inspector runs git WITHOUT this var -> only the',
    '# participant\'s commands are captured.',
    `export GIT_TRACE2_EVENT="$HOME/${TRACE2_FILE}"`,
    '__ws_git_branch() {',
    '  local ref',
    '  # GIT_TRACE2_EVENT=false disables tracing for these prompt probes so they do not pollute the log.',
    '  ref=$(GIT_TRACE2_EVENT=false git symbolic-ref --short -q HEAD 2>/dev/null) && { printf " (%s)" "$ref"; return; }',
    '  ref=$(GIT_TRACE2_EVENT=false git rev-parse --short -q HEAD 2>/dev/null) && printf " (detached %s)" "$ref"',
    '}',
    "PS1='\\[\\e[36m\\]\\w\\[\\e[33m\\]$(__ws_git_branch)\\[\\e[0m\\]\\$ '",
    '',
  ].join('\n');
}

/**
 * Pure function: .bash_profile for the login shell (`bash -l`) that sources .bashrc –
 * a login shell otherwise does not read .bashrc automatically.
 */
export function renderBashProfile(): string {
  return '[ -r ~/.bashrc ] && . ~/.bashrc\n';
}

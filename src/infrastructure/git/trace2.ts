import { GitCommand } from '../../core/domain/RepoState';

/**
 * Parses a GIT_TRACE2_EVENT JSONL log into the list of git commands that ran.
 *
 * Trace2 emits one JSON object per line. Relevant events share a session id (`sid`):
 *  - `{"event":"start","sid":"…","argv":["git","cat-file","-p","HEAD"]}`
 *  - `{"event":"cmd_name","sid":"…","name":"cat-file"}`
 *  - `{"event":"exit","sid":"…","code":0}`  (or `atexit`)
 * We join them by `sid`: the `start` event gives the full argv, `cmd_name` the canonical
 * subcommand and `exit`/`atexit` the process exit code (so callers can require success).
 * Lines that are not JSON (or events we don't care about) are ignored, so a partially
 * written / concurrently appended file never throws.
 */
export function parseTrace2Commands(content: string): GitCommand[] {
  const argvBySid = new Map<string, string[]>();
  const nameBySid = new Map<string, string>();
  const codeBySid = new Map<string, number>();
  const order: string[] = []; // preserve first-seen order of invocations

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ev: { event?: string; sid?: string; argv?: unknown; name?: unknown; code?: unknown };
    try {
      ev = JSON.parse(trimmed);
    } catch {
      continue; // skip non-JSON / truncated lines
    }
    const sid = typeof ev.sid === 'string' ? ev.sid : undefined;
    if (!sid) continue;
    if (ev.event === 'start' && Array.isArray(ev.argv)) {
      if (!argvBySid.has(sid)) order.push(sid);
      argvBySid.set(sid, ev.argv.map(String));
    } else if (ev.event === 'cmd_name' && typeof ev.name === 'string') {
      nameBySid.set(sid, ev.name);
    } else if ((ev.event === 'exit' || ev.event === 'atexit') && typeof ev.code === 'number') {
      // `exit` comes first; don't let a later `atexit` overwrite it (they agree anyway).
      if (!codeBySid.has(sid)) codeBySid.set(sid, ev.code);
    }
  }

  const commands: GitCommand[] = [];
  for (const sid of order) {
    const argv = argvBySid.get(sid)!;
    commands.push({ name: nameBySid.get(sid) ?? subcommandFromArgv(argv), argv, exitCode: codeBySid.get(sid) });
  }
  return commands;
}

/**
 * Fallback when no cmd_name event is present: the first non-option token after argv[0].
 * `-c`/`-C` take a separate value argument, so their following token is skipped too.
 */
function subcommandFromArgv(argv: string[]): string {
  for (let i = 1; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '-c' || tok === '-C') {
      i++; // skip the option's value
      continue;
    }
    if (!tok.startsWith('-')) return tok;
  }
  return '';
}
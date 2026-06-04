import { describe, expect, it } from 'vitest';
import { parseTrace2Commands } from '../../src/infrastructure/git/trace2';

describe('parseTrace2Commands', () => {
  // A realistic (trimmed) GIT_TRACE2_EVENT log: two invocations, each with a `start`
  // (full argv) and a `cmd_name` (canonical subcommand), joined by their shared `sid`.
  const log = [
    JSON.stringify({ event: 'version', sid: 's1', evt: '3' }),
    JSON.stringify({ event: 'start', sid: 's1', argv: ['git', 'hash-object', '-w', 'brief.txt'] }),
    JSON.stringify({ event: 'cmd_name', sid: 's1', name: 'hash-object' }),
    JSON.stringify({ event: 'exit', sid: 's1', code: 0 }),
    JSON.stringify({ event: 'atexit', sid: 's1', code: 0 }),
    // a FAILED cat-file (bogus OID) -> exit 128
    JSON.stringify({ event: 'start', sid: 's2', argv: ['git', 'cat-file', '-p', 'deadbeef'] }),
    JSON.stringify({ event: 'cmd_name', sid: 's2', name: 'cat-file' }),
    JSON.stringify({ event: 'exit', sid: 's2', code: 128 }),
  ].join('\n');

  it('joins start + cmd_name + exit code per session (order preserved)', () => {
    expect(parseTrace2Commands(log)).toEqual([
      { name: 'hash-object', argv: ['git', 'hash-object', '-w', 'brief.txt'], exitCode: 0 },
      { name: 'cat-file', argv: ['git', 'cat-file', '-p', 'deadbeef'], exitCode: 128 },
    ]);
  });

  it('falls back to the first non-option argv token when cmd_name is missing', () => {
    const out = parseTrace2Commands(JSON.stringify({ event: 'start', sid: 'x', argv: ['git', '-c', 'core.pager=cat', 'ls-files'] }));
    expect(out).toEqual([{ name: 'ls-files', argv: ['git', '-c', 'core.pager=cat', 'ls-files'], exitCode: undefined }]);
  });

  it('ignores blank and non-JSON lines (truncated/partial writes)', () => {
    const out = parseTrace2Commands('\nnot json\n' + JSON.stringify({ event: 'start', sid: 'y', argv: ['git', 'status'] }) + '\n{ broken');
    expect(out).toEqual([{ name: 'status', argv: ['git', 'status'], exitCode: undefined }]);
  });

  it('returns empty for an empty log', () => {
    expect(parseTrace2Commands('')).toEqual([]);
  });
});
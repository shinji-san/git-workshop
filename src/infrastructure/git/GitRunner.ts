import { spawn } from 'node:child_process';

export interface RunOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  /** Optional stdin content (e.g. OID list for cat-file --batch). */
  readonly stdin?: string;
}

/**
 * The ONLY impure building block of the git binding: spawns `git` with argument arrays
 * (never via a shell -> paths with spaces are safe without quoting).
 * Parsing the output is pure and lives in parsers.ts.
 */
export class GitRunner {
  constructor(private readonly gitBin = 'git') {}

  run(args: string[], opts: RunOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.gitBin, args, {
        cwd: opts.cwd,
        env: opts.env,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
      child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`git ${args.join(' ')} -> exit ${code}: ${stderr.trim()}`));
      });
      if (opts.stdin !== undefined) {
        child.stdin.write(opts.stdin);
        child.stdin.end();
      }
    });
  }
}

import { spawn } from 'node:child_process';
import { RunOptions } from './GitRunner';

/**
 * Runs a whole command line in a shell – exclusively for trusted setup scripts
 * authored by exercise authors (which need shell features like >> or &&).
 * Do NOT use for user input or the inspector's measurement commands.
 */
export class ShellRunner {
  run(line: string, opts: RunOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === 'win32';
      const shell = isWin ? 'bash.exe' : 'bash';
      const child = spawn(shell, ['-c', line], {
        cwd: opts.cwd,
        env: opts.env,
        windowsHide: true,
      });
      let stderr = '';
      child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`setup "${line}" -> exit ${code}: ${stderr.trim()}`)),
      );
    });
  }
}

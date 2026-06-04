/** Abstraction over a real PTY (implementation: node-pty). */
export interface ITerminalSession {
  write(data: string): void;
  onData(listener: (data: string) => void): void;
  resize(cols: number, rows: number): void;
  dispose(): void;
}

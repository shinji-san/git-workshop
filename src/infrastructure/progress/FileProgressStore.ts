import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { IProgressStore } from '../../core/ports/IProgressStore';
import { ParticipantProgress, ProgressData } from '../../core/domain/ParticipantProgress';

/**
 * Stores learner progress as JSON (e.g. ~/.git-workshop/progress.json).
 * Writes atomically via a temp file + rename so a crash cannot leave a half-written
 * file. A missing or corrupt file is treated as "first run" (start fresh, don't crash).
 */
export class FileProgressStore implements IProgressStore {
  constructor(
    private readonly filePath: string,
    private readonly appVersion: string,
  ) {}

  async load(): Promise<{ progress: ParticipantProgress; created: boolean }> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const data = JSON.parse(raw) as Partial<ProgressData>;
      return { progress: ParticipantProgress.fromJSON(data, this.appVersion), created: false };
    } catch {
      // ENOENT (first run) or unparseable file -> start fresh.
      return { progress: ParticipantProgress.empty(this.appVersion), created: true };
    }
  }

  async save(progress: ParticipantProgress): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(progress.toJSON(), null, 2), 'utf8');
    await fs.rename(tmp, this.filePath);
  }

  async clear(): Promise<void> {
    // force: ignore ENOENT so a reset works even when nothing was saved yet.
    await fs.rm(this.filePath, { force: true });
  }
}

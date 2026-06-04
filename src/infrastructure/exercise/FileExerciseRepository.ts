import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { IExerciseRepository, ExerciseSummary } from '../../core/ports/IExerciseRepository';
import { Exercise } from '../../core/domain/Exercise';
import { ExerciseFileSchema, ExerciseFileDto } from './schema';
import { verifyUnlock } from './unlockCode';

/**
 * Loads exercises from the file system. An exercise package is a folder:
 *   <exercisesRoot>/<slug>/exercise.yaml + <slug>.bundle (+ exercise.schema.json)
 * The folder name is a human-readable slug; the stable identity is the UUID `id`
 * inside the YAML. `load(id)` therefore resolves the folder by scanning for the
 * matching `id`. Paths in the YAML are relative to the package folder -> movable.
 */
export class FileExerciseRepository implements IExerciseRepository {
  constructor(private readonly exercisesRoot: string) {}

  async list(): Promise<ExerciseSummary[]> {
    const entries = await fs.readdir(this.exercisesRoot, { withFileTypes: true });
    const summaries: ExerciseSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const dto = await this.readDir(entry.name);
        summaries.push({ id: dto.id, chapter: dto.chapter, title: dto.title, gated: !!dto.unlock });
      } catch {
        // skip a broken package while listing; load() then reports the error clearly
      }
    }
    return summaries;
  }

  /** Ids of gated exercises whose stored hash matches `code`. Codes/hashes never leave this layer. */
  async matchUnlockCode(code: string): Promise<string[]> {
    if (!code.trim()) return [];
    const entries = await fs.readdir(this.exercisesRoot, { withFileTypes: true });
    const ids: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const dto = await this.readDir(entry.name);
        if (dto.unlock && verifyUnlock(code, dto.unlock)) ids.push(dto.id);
      } catch {
        // ignore broken packages while matching
      }
    }
    return ids;
  }

  async load(id: string): Promise<Exercise> {
    const dir = await this.resolveDir(id);
    if (!dir) throw new Error(`Aufgabe mit id ${id} nicht gefunden`);
    const dto = await this.readDir(dir);
    return this.toDomain(dto, path.join(this.exercisesRoot, dir));
  }

  /** Find the package folder whose YAML carries the given UUID `id`. */
  private async resolveDir(id: string): Promise<string | undefined> {
    const entries = await fs.readdir(this.exercisesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const dto = await this.readDir(entry.name);
        if (dto.id === id) return entry.name;
      } catch {
        // ignore broken packages while resolving
      }
    }
    return undefined;
  }

  private async readDir(dirName: string): Promise<ExerciseFileDto> {
    const file = path.join(this.exercisesRoot, dirName, 'exercise.yaml');
    const raw = await fs.readFile(file, 'utf8');
    const parsed = yaml.load(raw);
    const result = ExerciseFileSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(`Aufgabe ${dirName}: ${issue.path.join('.')}: ${issue.message}`);
    }
    return result.data;
  }

  /** DTO -> domain; resolve relative bundle paths against the package folder. */
  private toDomain(dto: ExerciseFileDto, packageDir: string): Exercise {
    return {
      id: dto.id,
      chapter: dto.chapter,
      title: dto.title,
      durationMinutes: dto.durationMinutes,
      intro: dto.intro,
      debrief: dto.debrief,
      provisioning: {
        bundle: dto.provisioning.bundle ? path.resolve(packageDir, dto.provisioning.bundle) : undefined,
        keepOrigin: dto.provisioning.keepOrigin,
        setup: dto.provisioning.setup,
      },
      commonPitfalls: dto.commonPitfalls,
      steps: dto.steps,
    };
  }
}

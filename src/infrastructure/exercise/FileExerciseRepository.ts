import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { IExerciseRepository, ExerciseSummary } from '../../core/ports/IExerciseRepository';
import { Exercise, Step } from '../../core/domain/Exercise';
import { Pitfall } from '../../core/domain/Pitfall';
import { Locale, canonicalLocale, languageOf, resolveLocale } from '../../core/i18n/Locale';
import {
  ExerciseStructureSchema,
  ExerciseStructureDto,
  ExerciseTextsSchema,
  ExerciseTextsDto,
  PitfallConditionDto,
} from './schema';
import { substituteDeep, Vars } from './placeholders';
import { verifyUnlock } from './unlockCode';

/** Sub-folder of a package holding one texts file per locale (`i18n/de-DE.yaml`, …). */
export const TEXTS_DIR = 'i18n';

/**
 * Loads exercises from the file system. An exercise package is a folder:
 *   <exercisesRoot>/<slug>/exercise.yaml              language-neutral structure (ids, goals, provisioning)
 *   <exercisesRoot>/<slug>/i18n/<locale>.yaml         texts per BCP 47 locale, incl. `vars`
 *   <exercisesRoot>/<slug>/<slug>[.<locale>].bundle   generated starting history (see provisioning.bundle)
 * The folder name is a human-readable slug; the stable identity is the UUID `id` inside the
 * structure. `load(id)` therefore resolves the folder by scanning for the matching `id`. Paths in
 * the YAML are relative to the package folder -> movable.
 *
 * Locale resolution (`resolveLocale`): exact tag → same language → de-DE → first available. The
 * `vars` of the CONTENT locale (default: the texts locale) plus the built-ins `${locale}`/`${lang}`
 * are substituted into structure and texts before the domain object is built, so the domain never
 * sees placeholders.
 */
export class FileExerciseRepository implements IExerciseRepository {
  constructor(private readonly exercisesRoot: string) {}

  async list(locale: Locale): Promise<ExerciseSummary[]> {
    const summaries: ExerciseSummary[] = [];
    for (const dir of await this.packageDirs()) {
      try {
        const exercise = await this.loadDir(dir, locale);
        summaries.push({
          id: exercise.id,
          chapter: exercise.chapter,
          title: exercise.title,
          locale: exercise.locale,
          gated: exercise.gated,
        });
      } catch {
        // skip a broken package while listing; load() then reports the error clearly
      }
    }
    return summaries;
  }

  /** Ids of gated exercises whose stored hash matches `code`. Codes/hashes never leave this layer. */
  async matchUnlockCode(code: string): Promise<string[]> {
    if (!code.trim()) return [];
    const ids: string[] = [];
    for (const dir of await this.packageDirs()) {
      try {
        const structure = await this.readStructure(dir);
        if (structure.unlock && verifyUnlock(code, structure.unlock)) ids.push(structure.id);
      } catch {
        // ignore broken packages while matching
      }
    }
    return ids;
  }

  async load(id: string, locale: Locale, contentLocale?: Locale): Promise<Exercise> {
    const dir = await this.resolveDir(id);
    if (!dir) throw new Error(`Aufgabe mit id ${id} nicht gefunden`);
    return this.loadDir(dir, locale, contentLocale);
  }

  /** Locales a package ships texts for (canonical tags, sorted). */
  async availableLocales(dir: string): Promise<Locale[]> {
    const textsDir = path.join(this.exercisesRoot, dir, TEXTS_DIR);
    let entries: string[];
    try {
      entries = await fs.readdir(textsDir);
    } catch {
      return [];
    }
    const locales: Locale[] = [];
    for (const name of entries) {
      const m = name.match(/^(.+)\.ya?ml$/);
      const tag = m ? canonicalLocale(m[1]) : undefined;
      if (tag && !locales.includes(tag)) locales.push(tag);
    }
    return locales.sort();
  }

  // --- internals --------------------------------------------------------

  private async packageDirs(): Promise<string[]> {
    const entries = await fs.readdir(this.exercisesRoot, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }

  /** Find the package folder whose structure carries the given UUID `id`. */
  private async resolveDir(id: string): Promise<string | undefined> {
    for (const dir of await this.packageDirs()) {
      try {
        if ((await this.readStructure(dir)).id === id) return dir;
      } catch {
        // ignore broken packages while resolving
      }
    }
    return undefined;
  }

  private async readStructure(dir: string): Promise<ExerciseStructureDto> {
    const file = path.join(this.exercisesRoot, dir, 'exercise.yaml');
    const parsed = yaml.load(await fs.readFile(file, 'utf8'));
    const result = ExerciseStructureSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(`Aufgabe ${dir}: exercise.yaml: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    return result.data;
  }

  /** Read the texts of exactly `locale` (which must exist and declare the same tag). */
  private async readTexts(dir: string, locale: Locale): Promise<ExerciseTextsDto> {
    const rel = `${TEXTS_DIR}/${locale}.yaml`;
    const parsed = yaml.load(await fs.readFile(path.join(this.exercisesRoot, dir, rel), 'utf8'));
    const result = ExerciseTextsSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new Error(`Aufgabe ${dir}: ${rel}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    if (canonicalLocale(result.data.locale) !== locale) {
      throw new Error(`Aufgabe ${dir}: ${rel}: locale "${result.data.locale}" passt nicht zum Dateinamen`);
    }
    return result.data;
  }

  /** The best available texts for `requested` (see resolveLocale). */
  private async resolveTexts(dir: string, requested: Locale): Promise<ExerciseTextsDto> {
    const available = await this.availableLocales(dir);
    const locale = resolveLocale(requested, available);
    if (!locale) throw new Error(`Aufgabe ${dir}: keine Textdatei unter ${TEXTS_DIR}/ gefunden`);
    return this.readTexts(dir, locale);
  }

  private async loadDir(dir: string, locale: Locale, contentLocale?: Locale): Promise<Exercise & { gated: boolean }> {
    const structure = await this.readStructure(dir);
    const texts = await this.resolveTexts(dir, locale);
    const wantContent = contentLocale ? canonicalLocale(contentLocale) : undefined;
    const content = wantContent && wantContent !== texts.locale ? await this.resolveTexts(dir, wantContent) : texts;
    return { ...this.toDomain(dir, structure, texts, content), gated: !!structure.unlock };
  }

  /**
   * Structure + texts -> domain. Substitutes the content locale's `vars` (plus `${locale}`/`${lang}`)
   * into both, then joins steps and pitfalls by id – a missing or unknown id is an author error.
   */
  private toDomain(dir: string, structureDto: ExerciseStructureDto, textsDto: ExerciseTextsDto, content: ExerciseTextsDto): Exercise {
    const vars: Vars = { ...(content.vars ?? {}), locale: content.locale, lang: languageOf(content.locale) };
    const structureFile = `Aufgabe ${dir}: exercise.yaml`;
    const textsFile = `Aufgabe ${dir}: ${TEXTS_DIR}/${textsDto.locale}.yaml`;
    const structure = substituteDeep(structureDto, vars, structureFile);
    const texts = substituteDeep(textsDto, vars, textsFile);
    const packageDir = path.join(this.exercisesRoot, dir);

    const pitfallIds = new Set<string>();
    const pitfallTexts = texts.pitfalls ?? {};
    const toPitfall = (c: PitfallConditionDto): Pitfall => {
      if (pitfallIds.has(c.id)) throw new Error(`${structureFile}: Pitfall-Id "${c.id}" ist doppelt`);
      pitfallIds.add(c.id);
      const t = pitfallTexts[c.id];
      if (!t) throw new Error(`${textsFile}: keine Texte für Pitfall "${c.id}"`);
      return { id: c.id, when: c.when, severity: c.severity, message: t.message, recovery: t.recovery };
    };

    const stepIds = new Set<string>();
    const steps: Step[] = structure.steps.map((s) => {
      if (stepIds.has(s.id)) throw new Error(`${structureFile}: Schritt-Id "${s.id}" ist doppelt`);
      stepIds.add(s.id);
      const t = texts.steps[s.id];
      if (!t) throw new Error(`${textsFile}: keine Texte für Schritt "${s.id}"`);
      return { id: s.id, title: t.title, task: t.task, goals: s.goals, hints: t.hints, pitfalls: s.pitfalls?.map(toPitfall) };
    });
    const commonPitfalls = structure.commonPitfalls?.map(toPitfall);

    for (const id of Object.keys(texts.steps)) {
      if (!stepIds.has(id)) throw new Error(`${textsFile}: Texte für unbekannten Schritt "${id}"`);
    }
    for (const id of Object.keys(pitfallTexts)) {
      if (!pitfallIds.has(id)) throw new Error(`${textsFile}: Texte für unbekannten Pitfall "${id}"`);
    }

    return {
      id: structure.id,
      locale: texts.locale,
      contentLocale: content.locale,
      chapter: structure.chapter,
      title: texts.title,
      durationMinutes: structure.durationMinutes,
      intro: texts.intro,
      debrief: texts.debrief,
      provisioning: {
        bundle: structure.provisioning.bundle ? path.resolve(packageDir, structure.provisioning.bundle) : undefined,
        keepOrigin: structure.provisioning.keepOrigin,
        setup: structure.provisioning.setup,
      },
      commonPitfalls,
      steps,
    };
  }
}

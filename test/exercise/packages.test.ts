import { describe, expect, it } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { FileExerciseRepository, TEXTS_DIR } from '../../src/infrastructure/exercise/FileExerciseRepository';
import { UI_LOCALES } from '../../src/core/i18n/Locale';

/**
 * Every shipped exercise package must load in every UI locale: structure valid, all texts present
 * for every step/pitfall, every placeholder defined. This is the guard that keeps the German and
 * English variants in sync (no YAML drift goes unnoticed).
 */
const root = path.resolve('exercises');
const packages = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(root, d.name, 'exercise.yaml')))
  .map((d) => d.name);
const repo = new FileExerciseRepository(root);

const strings = (value: unknown, out: string[] = []): string[] => {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out));
  return out;
};

describe('shipped exercise packages', () => {
  it('ships texts for every UI locale', async () => {
    for (const pkg of packages) {
      expect(await repo.availableLocales(pkg), `${pkg}/${TEXTS_DIR}`).toEqual([...UI_LOCALES].sort());
    }
  });

  for (const locale of UI_LOCALES) {
    it(`lists and loads every package in ${locale} with all placeholders resolved`, async () => {
      const list = await repo.list(locale);
      expect(list.map((s) => s.id).sort()).toHaveLength(packages.length);
      for (const summary of list) {
        expect(summary.locale).toBe(locale);
        const ex = await repo.load(summary.id, locale);
        expect(ex.locale).toBe(locale);
        expect(ex.contentLocale).toBe(locale);
        expect(ex.title).toBe(summary.title);
        for (const s of strings(ex)) expect(s, `${summary.title}: unresolved placeholder`).not.toMatch(/\$\{/);
        for (const step of ex.steps) expect(step.goals.length).toBeGreaterThan(0);
      }
    });
  }

  it('resolves a bundle path per locale when the bundle content is localized', async () => {
    const de = await repo.list('de-DE');
    for (const s of de) {
      const ex = await repo.load(s.id, 'de-DE');
      if (ex.provisioning.bundle) expect(path.basename(ex.provisioning.bundle)).toMatch(/\.de-DE\.bundle$/);
    }
  });
});

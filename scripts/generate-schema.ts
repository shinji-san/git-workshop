/**
 * Generates the JSON schemas from the Zod schemas for editor validation of the YAML files.
 * Run: npm run schema:gen
 *
 * Two schemas per package: `exercise.schema.json` for the language-neutral structure and
 * `i18n/texts.schema.json` for the per-locale texts. Every YAML references its schema relatively
 * (`# yaml-language-server: $schema=./exercise.schema.json` / `./texts.schema.json`), so each
 * package stays self-contained and movable.
 */
import { writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ExerciseStructureSchema, ExerciseTextsSchema } from '../src/infrastructure/exercise/schema';
import { TEXTS_DIR } from '../src/infrastructure/exercise/FileExerciseRepository';

const render = (schema: Parameters<typeof zodToJsonSchema>[0], name: string) =>
  JSON.stringify(zodToJsonSchema(schema, { name, $refStrategy: 'none' }), null, 2) + '\n';

const structureJson = render(ExerciseStructureSchema, 'Exercise');
const textsJson = render(ExerciseTextsSchema, 'ExerciseTexts');

// Write into EVERY exercise package (folder with exercise.yaml).
const root = path.resolve('exercises');
const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
let count = 0;
for (const d of dirs) {
  const dir = path.join(root, d.name);
  if (!existsSync(path.join(dir, 'exercise.yaml'))) continue;
  const structureTarget = path.join(dir, 'exercise.schema.json');
  writeFileSync(structureTarget, structureJson, 'utf8');
  console.log(`JSON-Schema geschrieben: ${structureTarget}`);
  const textsDir = path.join(dir, TEXTS_DIR);
  mkdirSync(textsDir, { recursive: true });
  const textsTarget = path.join(textsDir, 'texts.schema.json');
  writeFileSync(textsTarget, textsJson, 'utf8');
  console.log(`JSON-Schema geschrieben: ${textsTarget}`);
  count++;
}
if (count === 0) console.warn('Keine Aufgabenpakete (exercise.yaml) gefunden.');

/**
 * Generates a JSON schema from the Zod schema for editor validation of the YAML files.
 * Run: npm run schema:gen
 */
import { writeFileSync, readdirSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ExerciseFileSchema } from '../src/infrastructure/exercise/schema';

const jsonSchema = zodToJsonSchema(ExerciseFileSchema, {
  name: 'Exercise',
  $refStrategy: 'none',
});
const content = JSON.stringify(jsonSchema, null, 2) + '\n';

// Write into EVERY exercise package (folder with exercise.yaml) – each YAML references
// its local schema relatively (# yaml-language-server: $schema=./exercise.schema.json).
const root = path.resolve('exercises');
const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
let count = 0;
for (const d of dirs) {
  const dir = path.join(root, d.name);
  if (!existsSync(path.join(dir, 'exercise.yaml'))) continue;
  const target = path.join(dir, 'exercise.schema.json');
  writeFileSync(target, content, 'utf8');
  console.log(`JSON-Schema geschrieben: ${target}`);
  count++;
}
if (count === 0) console.warn('Keine Aufgabenpakete (exercise.yaml) gefunden.');

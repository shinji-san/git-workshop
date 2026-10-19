/**
 * Builds the exercise bundles reproducibly from the declarative `bundle.yaml` files.
 * Run: npm run bundles:gen
 *
 * Why generate instead of commit? A bundle is a binary file; the committed history
 * lives entirely in each exercise's `bundle.yaml`. This keeps the repo free of binary
 * blobs (the `.bundle` files are in .gitignore) and lets anyone reproduce them identically.
 *
 * The source of truth is the exercise itself: this generator SCANS `exercises/*` for
 * `bundle.yaml`. The ops deliberately read like the git commands an author would type
 * (commit / branch / switch).
 *
 * Multilingual packages: `bundle.yaml` may use the `${vars}` of the texts files (file names,
 * contents, commit messages). The bundle is then built once PER LOCALE (`i18n/<locale>.yaml`) and
 * written to the substituted `provisioning.bundle` path of `exercise.yaml` – which therefore has to
 * contain `${locale}` (e.g. `./my-exercise.${locale}.bundle`) whenever the rendered spec differs
 * between locales. Identical specs share one file.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { z } from 'zod';
import { ExerciseStructureSchema, ExerciseTextsSchema } from '../src/infrastructure/exercise/schema';
import { TEXTS_DIR } from '../src/infrastructure/exercise/FileExerciseRepository';
import { substituteDeep } from '../src/infrastructure/exercise/placeholders';
import { canonicalLocale, languageOf } from '../src/core/i18n/Locale';

// --- Declarative format of bundle.yaml -------------------------------------
const FileMap = z.record(z.string()).refine((m) => Object.keys(m).length > 0, {
  message: 'commit braucht mindestens eine Datei in `files`',
});

const OpSchema = z.union([
  z.object({ commit: z.string().min(1), files: FileMap }).strict(),
  z.object({ branch: z.string().min(1) }).strict(),
  z.object({ switch: z.string().min(1) }).strict(),
]);

const BundleSpecSchema = z
  .object({
    defaultBranch: z.string().min(1).default('main'),
    head: z.string().min(1),
    ops: z.array(OpSchema).min(1),
  })
  .strict();

type BundleSpec = z.infer<typeof BundleSpecSchema>;

// Fixed identity + start time -> stable commit OIDs, independent of the runner's git config.
// Each commit advances the time by one minute so the order is unambiguous.
const AUTHOR_NAME = 'Workshop-Teilnehmer';
const AUTHOR_EMAIL = 'workshop@local';
const BASE_EPOCH = 1_700_000_000; // fixed start timestamp (UTC)

function buildBundle(id: string, spec: BundleSpec, outFile: string): void {
  const dir = mkdtempSync(path.join(tmpdir(), `ws-bundle-${id}-`));
  try {
    let tick = 0;
    const run = (args: string[], extraEnv: Record<string, string> = {}) =>
      execFileSync('git', args, {
        cwd: dir,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: AUTHOR_NAME,
          GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
          GIT_COMMITTER_NAME: AUTHOR_NAME,
          GIT_COMMITTER_EMAIL: AUTHOR_EMAIL,
          ...extraEnv,
        },
      });

    run(['init', '-q', '-b', spec.defaultBranch]);

    for (const o of spec.ops) {
      if ('branch' in o) {
        run(['branch', o.branch]); // creates a branch at the current HEAD, does NOT switch
      } else if ('switch' in o) {
        run(['switch', '-q', o.switch]);
      } else {
        for (const [rel, content] of Object.entries(o.files)) {
          const target = path.join(dir, rel);
          mkdirSync(path.dirname(target), { recursive: true });
          writeFileSync(target, content, 'utf8');
        }
        run(['add', '-A']);
        // Fix author AND committer date -> stable OIDs across runs.
        const when = `${BASE_EPOCH + tick++ * 60} +0000`;
        run(['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', o.commit], {
          GIT_AUTHOR_DATE: when,
          GIT_COMMITTER_DATE: when,
        });
      }
    }

    run(['switch', '-q', spec.head]);
    run(['bundle', 'create', outFile, '--all']);
    run(['bundle', 'verify', outFile]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Parse + validate a YAML file with a Zod schema; reports issues with their path. */
function readYaml<T>(file: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T | undefined {
  const parsed = schema.safeParse(parseYaml(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    console.error(`Ungueltige ${path.relative(process.cwd(), file)}:`);
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    process.exitCode = 1;
    return undefined;
  }
  return parsed.data;
}

// --- Discovery: scan exercises/* for bundle.yaml ---------------------------
const root = path.resolve('exercises');
const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
let count = 0;
for (const d of dirs) {
  const pkgDir = path.join(root, d.name);
  const specPath = path.join(pkgDir, 'bundle.yaml');
  if (!existsSync(specPath)) continue;

  const spec = readYaml(specPath, BundleSpecSchema);
  const structure = readYaml(path.join(pkgDir, 'exercise.yaml'), ExerciseStructureSchema);
  if (!spec || !structure) continue;
  if (!structure.provisioning.bundle) {
    console.error(`${d.name}: bundle.yaml vorhanden, aber exercise.yaml hat kein provisioning.bundle`);
    process.exitCode = 1;
    continue;
  }

  // One texts file per locale -> its vars render the spec and the output path.
  const textsDir = path.join(pkgDir, TEXTS_DIR);
  const localeFiles = existsSync(textsDir) ? readdirSync(textsDir).filter((f) => /\.ya?ml$/.test(f)) : [];
  if (localeFiles.length === 0) {
    console.error(`${d.name}: keine Textdateien unter ${TEXTS_DIR}/ – ohne vars kann kein Bundle gebaut werden`);
    process.exitCode = 1;
    continue;
  }

  const built = new Map<string, string>(); // output path -> rendered spec (JSON), to detect collisions
  for (const file of localeFiles.sort()) {
    const texts = readYaml(path.join(textsDir, file), ExerciseTextsSchema);
    if (!texts) continue;
    const locale = canonicalLocale(texts.locale) ?? texts.locale;
    const vars = { ...(texts.vars ?? {}), locale, lang: languageOf(locale) };
    const where = `${d.name}/${TEXTS_DIR}/${file}`;
    let rendered: BundleSpec;
    let out: string;
    try {
      rendered = substituteDeep(spec, vars, `${d.name}/bundle.yaml`);
      out = path.resolve(pkgDir, substituteDeep(structure.provisioning.bundle, vars, `${d.name}/exercise.yaml`));
    } catch (err) {
      console.error(`${where}: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
      continue;
    }
    const key = JSON.stringify(rendered);
    const previous = built.get(out);
    if (previous !== undefined) {
      if (previous !== key) {
        console.error(
          `${d.name}: das Bundle fuer ${locale} unterscheidet sich, aber provisioning.bundle enthaelt kein \${locale} – Pfad kollidiert: ${out}`,
        );
        process.exitCode = 1;
      }
      continue; // identical spec -> the already built file serves this locale too
    }
    buildBundle(d.name, rendered, out);
    built.set(out, key);
    console.log(`Bundle erzeugt und verifiziert (${locale}): ${out}`);
    count++;
  }
}
if (count === 0) console.warn('Keine bundle.yaml-Deklarationen unter exercises/ gefunden.');

/**
 * Builds the exercise bundles reproducibly from the declarative `bundle.yaml` files.
 * Run: npm run bundles:gen
 *
 * Why generate instead of commit? A bundle is a binary file; the committed history
 * lives entirely in each exercise's `bundle.yaml`. This keeps the repo free of binary
 * blobs (the `.bundle` files are in .gitignore) and lets anyone reproduce them identically.
 *
 * The source of truth is the exercise itself: this generator SCANS `exercises/*` for
 * `bundle.yaml` and builds `exercises/<id>/<id>.bundle` for each match. The ops deliberately
 * read like the git commands an author would type (commit / branch / switch).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { z } from 'zod';

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

// --- Discovery: scan exercises/* for bundle.yaml ---------------------------
const root = path.resolve('exercises');
const dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
let count = 0;
for (const d of dirs) {
  const specPath = path.join(root, d.name, 'bundle.yaml');
  if (!existsSync(specPath)) continue;

  const parsed = BundleSpecSchema.safeParse(parseYaml(readFileSync(specPath, 'utf8')));
  if (!parsed.success) {
    console.error(`Ungueltige ${path.relative(root, specPath)}:`);
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
    }
    process.exitCode = 1;
    continue;
  }

  const out = path.join(root, d.name, `${d.name}.bundle`);
  buildBundle(d.name, parsed.data, out);
  console.log(`Bundle erzeugt und verifiziert: ${out}`);
  count++;
}
if (count === 0) console.warn('Keine bundle.yaml-Deklarationen unter exercises/ gefunden.');

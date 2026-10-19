import { z } from 'zod';
import { LOCALE_TAG_RE } from '../../core/i18n/Locale';

/**
 * Single source of truth for runtime validation AND the static types of the on-disk exercise
 * format. Deliberately separate from the domain types (anti-corruption layer): the file format
 * stays stable even when the internal code is refactored.
 *
 * A package consists of two kinds of files:
 *  - `exercise.yaml`        the language-NEUTRAL structure (schemaVersion 2): ids, goals, pitfall
 *                           conditions, provisioning, unlock gate. No prose.
 *  - `i18n/<locale>.yaml`   the texts for one BCP 47 locale (schemaVersion 1): title, intro,
 *                           debrief, per-step title/task/hints, per-pitfall message/recovery, and
 *                           `vars` – values substituted into `${name}` placeholders of structure
 *                           AND texts (file names, commit messages, branch names, …).
 * The repository merges both by step/pitfall id. Keeping the structure in one file guarantees that
 * every language validates the very same goals.
 *
 * The discriminatedUnion maps the assertion union one-to-one and reports unknown types with a path
 * (good error messages for authors).
 */
const AssertionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('branchExists'), name: z.string() }),
  z.object({ type: z.literal('headOnBranch'), name: z.string() }),
  z.object({ type: z.literal('headDetached') }),
  z.object({ type: z.literal('repoInitialized') }),
  z.object({ type: z.literal('headUnborn'), branch: z.string().optional() }),
  z.object({
    type: z.literal('commitExists'),
    summary: z.string(),
    reachableFrom: z.string().optional(),
  }),
  z.object({ type: z.literal('tipHasParents'), branch: z.string(), count: z.number().int().nonnegative() }),
  z.object({ type: z.literal('branchAhead'), branch: z.string(), base: z.string(), by: z.number().int().nonnegative() }),
  z.object({ type: z.literal('commitCount'), ref: z.string(), count: z.number().int().nonnegative() }),
  z.object({ type: z.literal('tagExists'), name: z.string(), on: z.string().optional() }),
  z.object({ type: z.literal('danglingCommitExists'), summary: z.string().optional() }),
  z.object({ type: z.literal('noDanglingCommits') }),
  z.object({ type: z.literal('fileStaged'), path: z.string() }),
  z.object({ type: z.literal('fileInWorktree'), path: z.string() }),
  z.object({ type: z.literal('gitConfig'), key: z.string().min(1), value: z.string().optional() }),
  z.object({
    type: z.literal('gitCommandUsed'),
    name: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    argsContain: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal('objectExists'), kind: z.enum(['blob', 'tree', 'commit', 'tag']) }),
  z.object({ type: z.literal('indexEntry'), path: z.string().min(1) }),
]);

/** The language-neutral part of a pitfall; `message`/`recovery` live in the texts, keyed by `id`. */
const PitfallConditionSchema = z
  .object({
    id: z.string().min(1),
    when: z.array(AssertionSchema).min(1),
    severity: z.enum(['info', 'warning', 'danger']),
  })
  .strict();

/** The language-neutral part of a step; `title`/`task`/`hints` live in the texts, keyed by `id`. */
const StepStructureSchema = z
  .object({
    id: z.string().min(1),
    goals: z.array(AssertionSchema).min(1),
    pitfalls: z.array(PitfallConditionSchema).optional(),
  })
  .strict();

const ProvisioningSchema = z
  .object({
    // Optional: without a bundle the sandbox starts as an empty (non-git) directory,
    // e.g. for a `git init` exercise. May contain `${locale}` for per-locale bundles.
    bundle: z.string().min(1).optional(),
    keepOrigin: z.boolean().optional(),
    setup: z.array(z.string()).optional(),
  })
  .strict();

export const ExerciseStructureSchema = z
  .object({
    schemaVersion: z.literal(2),
    /** Stable identity: a UUID, so progress survives renaming/retitling and chapter changes. */
    id: z.string().uuid(),
    /** Dotted chapter number for ordering/display (e.g. "1.0", "1.1", "2.0"). */
    chapter: z.string().regex(/^\d+(\.\d+)*$/, 'chapter must be a dotted number like "1.0" or "2.1"'),
    /** Optional time budget in minutes; drives the status-bar timer. */
    durationMinutes: z.number().int().positive().optional(),
    /**
     * Optional unlock gate. Present = the exercise is locked until the learner enters the matching
     * code. Only a salted SHA-256 hash is stored (never the plaintext), so the public repo cannot
     * be used to look the code up. Authored via `npm run unlock:gen`.
     */
    unlock: z
      .object({
        salt: z.string().min(1),
        hash: z.string().regex(/^[0-9a-f]{64}$/, 'hash must be a 64-char hex sha256 digest'),
      })
      .strict()
      .optional(),
    provisioning: ProvisioningSchema,
    commonPitfalls: z.array(PitfallConditionSchema).optional(),
    steps: z.array(StepStructureSchema).min(1),
  })
  .strict();

/** Static type of the structure file – derived from the same schema. */
export type ExerciseStructureDto = z.infer<typeof ExerciseStructureSchema>;
export type PitfallConditionDto = z.infer<typeof PitfallConditionSchema>;

const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Built-in placeholders the repository always provides; authors cannot redefine them. */
export const BUILTIN_VARS = ['locale', 'lang'] as const;

const StepTextsSchema = z
  .object({
    title: z.string().min(1),
    /** Task text for the right-hand panel (minimal rich text). */
    task: z.string().min(1),
    /** Escalating hint ladder, revealed one at a time on demand. */
    hints: z.array(z.string()).optional(),
  })
  .strict();

const PitfallTextsSchema = z
  .object({
    message: z.string().min(1),
    recovery: z.string().optional(),
  })
  .strict();

export const ExerciseTextsSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** BCP 47 tag (ISO 639-1 language + optional ISO 3166-1 region); must equal the file name. */
    locale: z.string().regex(LOCALE_TAG_RE, 'locale must be a BCP 47 tag like "de-DE" or "en-US"'),
    title: z.string().min(1),
    /** Optional concept framing shown above the goals (foldable, minimal rich text). */
    intro: z.string().min(1).optional(),
    /** Optional wrap-up shown on completion (minimal rich text). */
    debrief: z.string().min(1).optional(),
    /**
     * Localized VALUES substituted into `${name}` placeholders of the structure (goals, setup,
     * bundle path), of bundle.yaml and of these texts: file names, commit messages, branch names…
     * `${locale}` and `${lang}` are built in.
     */
    vars: z
      .record(z.string().regex(VAR_NAME_RE, 'var names: letters, digits, underscore'), z.string())
      .refine((v) => !BUILTIN_VARS.some((b) => b in v), { message: `vars ${BUILTIN_VARS.join('/')} are built in` })
      .optional(),
    /** Keyed by step id of the structure. */
    steps: z.record(z.string().min(1), StepTextsSchema),
    /** Keyed by pitfall id (step pitfalls and commonPitfalls alike). */
    pitfalls: z.record(z.string().min(1), PitfallTextsSchema).optional(),
  })
  .strict();

/** Static type of a texts file – derived from the same schema. */
export type ExerciseTextsDto = z.infer<typeof ExerciseTextsSchema>;

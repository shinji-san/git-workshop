import { z } from 'zod';

/**
 * Single source of truth for runtime validation AND the static type of the file format.
 * Deliberately separate from the domain types (anti-corruption layer): the on-disk format
 * stays stable even when the internal code is refactored.
 *
 * The discriminatedUnion maps the assertion union one-to-one and reports
 * unknown types with a path (good error messages for authors).
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

const PitfallSchema = z.object({
  id: z.string().min(1),
  when: z.array(AssertionSchema).min(1),
  severity: z.enum(['info', 'warning', 'danger']),
  message: z.string().min(1),
  recovery: z.string().optional(),
});

const StepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  task: z.string().min(1),
  goals: z.array(AssertionSchema).min(1),
  hints: z.array(z.string()).optional(),
  pitfalls: z.array(PitfallSchema).optional(),
});

const ProvisioningSchema = z.object({
  // Optional: without a bundle the sandbox starts as an empty (non-git) directory,
  // e.g. for a `git init` exercise.
  bundle: z.string().min(1).optional(),
  keepOrigin: z.boolean().optional(),
  setup: z.array(z.string()).optional(),
});

export const ExerciseFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    /** Stable identity: a UUID, so progress survives renaming/retitling and chapter changes. */
    id: z.string().uuid(),
    /** Dotted chapter number for ordering/display (e.g. "1.0", "1.1", "2.0"). */
    chapter: z.string().regex(/^\d+(\.\d+)*$/, 'chapter must be a dotted number like "1.0" or "2.1"'),
    title: z.string().min(1),
    /** Optional time budget in minutes; drives the status-bar timer. */
    durationMinutes: z.number().int().positive().optional(),
    /** Optional concept framing shown above the goals (foldable, minimal rich text). */
    intro: z.string().min(1).optional(),
    /** Optional wrap-up shown on completion (minimal rich text). */
    debrief: z.string().min(1).optional(),
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
    commonPitfalls: z.array(PitfallSchema).optional(),
    steps: z.array(StepSchema).min(1),
  })
  .strict();

/** Static type of the file format – derived from the same schema. */
export type ExerciseFileDto = z.infer<typeof ExerciseFileSchema>;

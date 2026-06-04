import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as yaml from 'js-yaml';
import { ExerciseFileSchema } from '../../src/infrastructure/exercise/schema';

describe('ExerciseFileSchema', () => {
  it('validates the bundled exercise template', () => {
    const file = path.resolve('exercises/feature-branch-merge/exercise.yaml');
    const parsed = yaml.load(readFileSync(file, 'utf8'));
    const result = ExerciseFileSchema.safeParse(parsed);
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown assertion type with a path', () => {
    const bad = {
      schemaVersion: 1,
      id: 'cb7e9640-6054-11f1-ae52-93ab3bd7695f',
      chapter: '1.0',
      title: 'x',
      provisioning: { bundle: 'x.bundle' },
      steps: [{ id: 's', title: 's', task: 't', goals: [{ type: 'branchExist', name: 'f' }] }],
    };
    const result = ExerciseFileSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('rejects a step without goals', () => {
    const bad = {
      schemaVersion: 1,
      id: 'd8c11ada-6054-11f1-a85e-a3e277fd3a0d',
      chapter: '1.0',
      title: 'x',
      provisioning: { bundle: 'x.bundle' },
      steps: [{ id: 's', title: 's', task: 't', goals: [] }],
    };
    expect(ExerciseFileSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a non-UUID id', () => {
    const bad = {
      schemaVersion: 1,
      id: 'not-a-uuid',
      chapter: '1.0',
      title: 'x',
      provisioning: { bundle: 'x.bundle' },
      steps: [{ id: 's', title: 's', task: 't', goals: [{ type: 'headDetached' }] }],
    };
    expect(ExerciseFileSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts an exercise with no bundle (e.g. a git init exercise)', () => {
    const ok = {
      schemaVersion: 1,
      id: 'bce4b306-7aaf-4c80-bd7d-48450b7ad846',
      chapter: '1.0',
      title: 'x',
      provisioning: {},
      steps: [{ id: 's', title: 's', task: 't', goals: [{ type: 'headUnborn' }] }],
    };
    expect(ExerciseFileSchema.safeParse(ok).success).toBe(true);
  });

  it('accepts the plumbing assertions (gitCommandUsed / objectExists / indexEntry)', () => {
    const ok = {
      schemaVersion: 1,
      id: '935a02ac-6003-4b4c-a07e-d858d5c854ae',
      chapter: '3.0',
      title: 'x',
      provisioning: { setup: ['git init -q'] },
      steps: [
        {
          id: 's',
          title: 's',
          task: 't',
          goals: [
            { type: 'gitCommandUsed', name: 'hash-object', argsContain: ['-w'] },
            { type: 'objectExists', kind: 'blob' },
            { type: 'indexEntry', path: 'brief.txt' },
          ],
        },
      ],
    };
    expect(ExerciseFileSchema.safeParse(ok).success).toBe(true);
  });

  it('validates the bundled plumbing exercise file', () => {
    const file = path.resolve('exercises/git-plumbing-blob/exercise.yaml');
    const parsed = yaml.load(readFileSync(file, 'utf8'));
    const result = ExerciseFileSchema.safeParse(parsed);
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('accepts gitCommandUsed.name as a single string or a list', () => {
    const mk = (name: unknown) => ({
      schemaVersion: 1,
      id: 'e2730d6b-0e54-4bd4-b81d-6212a5abde3e',
      chapter: '1.1',
      title: 'x',
      provisioning: {},
      steps: [{ id: 's', title: 's', task: 't', goals: [{ type: 'gitCommandUsed', name }] }],
    });
    expect(ExerciseFileSchema.safeParse(mk('show')).success).toBe(true);
    expect(ExerciseFileSchema.safeParse(mk(['show', 'log'])).success).toBe(true);
    expect(ExerciseFileSchema.safeParse(mk([])).success).toBe(false); // empty list rejected
  });

  it('validates the reworked git-config exercise (commit + inspect steps)', () => {
    const file = path.resolve('exercises/git-config-setup/exercise.yaml');
    const result = ExerciseFileSchema.safeParse(yaml.load(readFileSync(file, 'utf8')));
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('accepts optional intro/debrief and rejects an empty one', () => {
    const base = {
      schemaVersion: 1,
      id: 'bce4b306-7aaf-4c80-bd7d-48450b7ad846',
      chapter: '1.0',
      title: 'x',
      provisioning: {},
      steps: [{ id: 's', title: 's', task: 't', goals: [{ type: 'headUnborn' }] }],
    };
    // present
    expect(ExerciseFileSchema.safeParse({ ...base, intro: 'Konzept', debrief: 'Fazit' }).success).toBe(true);
    // absent (optional)
    expect(ExerciseFileSchema.safeParse(base).success).toBe(true);
    // empty string rejected (min(1))
    expect(ExerciseFileSchema.safeParse({ ...base, intro: '' }).success).toBe(false);
  });

  it('rejects a non-positive durationMinutes', () => {
    const bad = {
      schemaVersion: 1,
      id: 'ddaaa188-6054-11f1-95ce-0f57d5f92864',
      chapter: '1.0',
      title: 'x',
      durationMinutes: 0,
      provisioning: { bundle: 'x.bundle' },
      steps: [{ id: 's', title: 's', task: 't', goals: [{ type: 'headDetached' }] }],
    };
    expect(ExerciseFileSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts a valid unlock block and rejects a malformed hash', () => {
    const base = {
      schemaVersion: 1,
      id: 'bce4b306-7aaf-4c80-bd7d-48450b7ad846',
      chapter: '2.0',
      title: 'x',
      provisioning: {},
      steps: [{ id: 's', title: 's', task: 't', goals: [{ type: 'headUnborn' }] }],
    };
    const hash = 'a'.repeat(64);
    expect(ExerciseFileSchema.safeParse({ ...base, unlock: { salt: 'abcd', hash } }).success).toBe(true);
    expect(ExerciseFileSchema.safeParse(base).success).toBe(true); // unlock optional
    // hash must be 64 hex chars
    expect(ExerciseFileSchema.safeParse({ ...base, unlock: { salt: 'abcd', hash: 'xyz' } }).success).toBe(false);
    // both fields required
    expect(ExerciseFileSchema.safeParse({ ...base, unlock: { hash } }).success).toBe(false);
  });

  it('validates the gated remote-bare exercise (carries an unlock block)', () => {
    const file = path.resolve('exercises/git-remote-bare/exercise.yaml');
    const result = ExerciseFileSchema.safeParse(yaml.load(readFileSync(file, 'utf8')));
    if (!result.success) console.error(result.error.issues);
    expect(result.success).toBe(true);
  });

  it('rejects a malformed chapter', () => {
    const bad = {
      schemaVersion: 1,
      id: 'ddaaa188-6054-11f1-95ce-0f57d5f92864',
      chapter: '1.x',
      title: 'x',
      provisioning: { bundle: 'x.bundle' },
      steps: [{ id: 's', title: 's', task: 't', goals: [{ type: 'headDetached' }] }],
    };
    expect(ExerciseFileSchema.safeParse(bad).success).toBe(false);
  });
});

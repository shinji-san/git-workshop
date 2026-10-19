import { describe, expect, it } from 'vitest';
import { ExerciseStructureSchema, ExerciseTextsSchema } from '../../src/infrastructure/exercise/schema';

/** A minimal valid structure (schemaVersion 2 – no prose in here). */
const structure = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 2,
  id: 'cb7e9640-6054-11f1-ae52-93ab3bd7695f',
  chapter: '1.0',
  provisioning: { bundle: 'x.bundle' },
  steps: [{ id: 's', goals: [{ type: 'headDetached' }] }],
  ...over,
});

/** A minimal valid texts file for the structure above. */
const texts = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  locale: 'de-DE',
  title: 'x',
  steps: { s: { title: 's', task: 't' } },
  ...over,
});

describe('ExerciseStructureSchema (v2, language-neutral)', () => {
  it('accepts a minimal structure and one without a bundle (git init exercise)', () => {
    expect(ExerciseStructureSchema.safeParse(structure()).success).toBe(true);
    expect(ExerciseStructureSchema.safeParse(structure({ provisioning: {} })).success).toBe(true);
  });

  it('rejects the old inline-text format (v1) – texts belong into i18n/<locale>.yaml', () => {
    expect(ExerciseStructureSchema.safeParse(structure({ schemaVersion: 1 })).success).toBe(false);
    expect(ExerciseStructureSchema.safeParse(structure({ title: 'inline' })).success).toBe(false);
    const inlineStep = structure({ steps: [{ id: 's', title: 's', task: 't', goals: [{ type: 'headDetached' }] }] });
    expect(ExerciseStructureSchema.safeParse(inlineStep).success).toBe(false);
  });

  it('rejects an unknown assertion type with a path', () => {
    const bad = structure({ steps: [{ id: 's', goals: [{ type: 'branchExist', name: 'f' }] }] });
    expect(ExerciseStructureSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a step without goals, a non-UUID id and a malformed chapter', () => {
    expect(ExerciseStructureSchema.safeParse(structure({ steps: [{ id: 's', goals: [] }] })).success).toBe(false);
    expect(ExerciseStructureSchema.safeParse(structure({ id: 'not-a-uuid' })).success).toBe(false);
    expect(ExerciseStructureSchema.safeParse(structure({ chapter: '1.x' })).success).toBe(false);
  });

  it('accepts the plumbing assertions and placeholders in assertion values', () => {
    const ok = structure({
      provisioning: { setup: ['git init -q', 'printf "${content}\\n" > ${file}'] },
      steps: [
        {
          id: 's',
          goals: [
            { type: 'gitCommandUsed', name: 'hash-object', argsContain: ['-w'] },
            { type: 'objectExists', kind: 'blob' },
            { type: 'indexEntry', path: '${file}' },
            { type: 'gitCommandUsed', name: ['show', 'log'] },
          ],
        },
      ],
    });
    expect(ExerciseStructureSchema.safeParse(ok).success).toBe(true);
    expect(ExerciseStructureSchema.safeParse(structure({ steps: [{ id: 's', goals: [{ type: 'gitCommandUsed', name: [] }] }] })).success).toBe(false);
  });

  it('validates the unlock block and durationMinutes', () => {
    const hash = 'a'.repeat(64);
    expect(ExerciseStructureSchema.safeParse(structure({ unlock: { salt: 'abcd', hash } })).success).toBe(true);
    expect(ExerciseStructureSchema.safeParse(structure({ unlock: { salt: 'abcd', hash: 'xyz' } })).success).toBe(false);
    expect(ExerciseStructureSchema.safeParse(structure({ unlock: { hash } })).success).toBe(false);
    expect(ExerciseStructureSchema.safeParse(structure({ durationMinutes: 0 })).success).toBe(false);
  });

  it('keeps pitfall conditions language-neutral (message/recovery are texts)', () => {
    const cond = { id: 'p', when: [{ type: 'headDetached' }], severity: 'warning' };
    expect(ExerciseStructureSchema.safeParse(structure({ commonPitfalls: [cond] })).success).toBe(true);
    expect(ExerciseStructureSchema.safeParse(structure({ commonPitfalls: [{ ...cond, message: 'x' }] })).success).toBe(false);
  });
});

describe('ExerciseTextsSchema (one file per locale)', () => {
  it('accepts a minimal texts file and optional intro/debrief/hints/pitfalls/vars', () => {
    expect(ExerciseTextsSchema.safeParse(texts()).success).toBe(true);
    const full = texts({
      intro: 'Konzept',
      debrief: 'Fazit',
      vars: { noteFile: 'notiz.txt', commit_msg: 'Notiz angelegt' },
      steps: { s: { title: 's', task: 'committe ${noteFile}', hints: ['h1', 'h2'] } },
      pitfalls: { p: { message: 'm', recovery: 'r' } },
    });
    expect(ExerciseTextsSchema.safeParse(full).success).toBe(true);
  });

  it('requires a BCP 47 locale tag', () => {
    expect(ExerciseTextsSchema.safeParse(texts({ locale: 'en-US' })).success).toBe(true);
    expect(ExerciseTextsSchema.safeParse(texts({ locale: 'en' })).success).toBe(true);
    expect(ExerciseTextsSchema.safeParse(texts({ locale: 'german' })).success).toBe(false);
    expect(ExerciseTextsSchema.safeParse(texts({ locale: 'de_DE' })).success).toBe(false);
    expect(ExerciseTextsSchema.safeParse(texts({ locale: 'DE-de' })).success).toBe(false);
  });

  it('rejects empty intro/debrief, reserved var names and unknown keys', () => {
    expect(ExerciseTextsSchema.safeParse(texts({ intro: '' })).success).toBe(false);
    expect(ExerciseTextsSchema.safeParse(texts({ vars: { locale: 'x' } })).success).toBe(false);
    expect(ExerciseTextsSchema.safeParse(texts({ vars: { lang: 'x' } })).success).toBe(false);
    expect(ExerciseTextsSchema.safeParse(texts({ vars: { 'bad-name': 'x' } })).success).toBe(false);
    expect(ExerciseTextsSchema.safeParse(texts({ goals: [] })).success).toBe(false);
  });
});

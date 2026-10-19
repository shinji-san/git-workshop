import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { FileExerciseRepository } from '../../src/infrastructure/exercise/FileExerciseRepository';

const ID = 'a1c7d0f4-4b0e-4c3f-9b2a-2f6c5d8e9a11';

const STRUCTURE = `
schemaVersion: 2
id: ${ID}
chapter: "1.0"
provisioning:
  bundle: ./demo.\${locale}.bundle
  setup:
    - printf "\${content}\\n" > \${file}
commonPitfalls:
  - id: detached
    when: [{ type: headDetached }]
    severity: warning
steps:
  - id: commit
    goals:
      - type: commitExists
        summary: \${msg}
    pitfalls:
      - id: wrong-branch
        when: [{ type: headOnBranch, name: feature }]
        severity: info
`;

const DE = `
schemaVersion: 1
locale: de-DE
title: Datei committen
intro: Konzept (\${lang})
vars: { file: notiz.txt, content: Hallo, msg: Notiz angelegt }
steps:
  commit:
    title: Committen
    task: Committe \${file} mit "\${msg}".
    hints: ['git add \${file}']
pitfalls:
  detached: { message: Detached!, recovery: git switch main }
  wrong-branch: { message: Falscher Branch }
`;

const EN = `
schemaVersion: 1
locale: en-US
title: Commit a file
vars: { file: note.txt, content: Hello, msg: Add note }
steps:
  commit:
    title: Commit
    task: Commit \${file} with "\${msg}".
pitfalls:
  detached: { message: Detached! }
  wrong-branch: { message: Wrong branch }
`;

describe('FileExerciseRepository (structure + i18n texts)', () => {
  let root: string;
  let repo: FileExerciseRepository;

  const write = async (rel: string, content: string) => {
    const file = path.join(root, rel);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
  };

  beforeEach(async () => {
    root = path.join(os.tmpdir(), 'gw-repo-test', randomUUID());
    await write('demo/exercise.yaml', STRUCTURE);
    await write('demo/i18n/de-DE.yaml', DE);
    await write('demo/i18n/en-US.yaml', EN);
    repo = new FileExerciseRepository(root);
  });

  afterEach(async () => {
    await fs.rm(path.dirname(root), { recursive: true, force: true });
  });

  it('lists with localized titles and the resolved locale', async () => {
    expect(await repo.list('de-DE')).toEqual([{ id: ID, chapter: '1.0', title: 'Datei committen', locale: 'de-DE', gated: false }]);
    expect((await repo.list('en-GB'))[0]).toMatchObject({ title: 'Commit a file', locale: 'en-US' }); // same language
    expect((await repo.list('fr-FR'))[0]).toMatchObject({ title: 'Datei committen', locale: 'de-DE' }); // default fallback
  });

  it('substitutes the vars of the content locale into structure and texts', async () => {
    const ex = await repo.load(ID, 'en-US');
    expect(ex.locale).toBe('en-US');
    expect(ex.contentLocale).toBe('en-US');
    expect(ex.provisioning.bundle).toBe(path.join(root, 'demo', 'demo.en-US.bundle'));
    expect(ex.provisioning.setup).toEqual(['printf "Hello\\n" > note.txt']);
    expect(ex.steps[0].goals[0]).toEqual({ type: 'commitExists', summary: 'Add note' });
    expect(ex.steps[0].task).toBe('Commit note.txt with "Add note".');
    expect(ex.steps[0].pitfalls?.[0]).toMatchObject({ id: 'wrong-branch', severity: 'info', message: 'Wrong branch' });
    expect(ex.commonPitfalls?.[0]).toMatchObject({ id: 'detached', message: 'Detached!', recovery: undefined });
  });

  it('exposes the built-in ${lang} and joins pitfalls/hints from the texts', async () => {
    const ex = await repo.load(ID, 'de-DE');
    expect(ex.intro).toBe('Konzept (de)');
    expect(ex.steps[0].hints).toEqual(['git add notiz.txt']);
    expect(ex.commonPitfalls?.[0].recovery).toBe('git switch main');
  });

  it('keeps the CONTENT locale when texts are requested in another language (resume / live switch)', async () => {
    const ex = await repo.load(ID, 'en-US', 'de-DE');
    expect(ex.locale).toBe('en-US');
    expect(ex.contentLocale).toBe('de-DE');
    expect(ex.steps[0].goals[0]).toEqual({ type: 'commitExists', summary: 'Notiz angelegt' }); // German sandbox values
    expect(ex.steps[0].task).toBe('Commit notiz.txt with "Notiz angelegt".'); // English text, German values
    expect(ex.provisioning.bundle).toBe(path.join(root, 'demo', 'demo.de-DE.bundle'));
  });

  it('reports missing or unknown ids and undefined placeholders as author errors', async () => {
    await write('demo/i18n/en-US.yaml', EN.replace('  commit:\n', '  commitx:\n'));
    await expect(repo.load(ID, 'en-US')).rejects.toThrow(/keine Texte für Schritt "commit"/);
    await write('demo/i18n/en-US.yaml', EN.replace('wrong-branch: { message: Wrong branch }', 'typo: { message: x }'));
    await expect(repo.load(ID, 'en-US')).rejects.toThrow(/Pitfall "wrong-branch"|unbekannten Pitfall "typo"/);
    await write('demo/i18n/en-US.yaml', EN.replace('msg: Add note', 'other: x'));
    await expect(repo.load(ID, 'en-US')).rejects.toThrow(/\$\{msg\}/);
  });

  it('rejects a texts file whose locale does not match its file name, and skips it in listings', async () => {
    await write('demo/i18n/en-US.yaml', EN.replace('locale: en-US', 'locale: en-GB'));
    await expect(repo.load(ID, 'en-US')).rejects.toThrow(/passt nicht zum Dateinamen/);
    expect(await repo.list('en-US')).toEqual([]); // broken in that locale -> not listed (load() explains)
    expect((await repo.list('de-DE'))[0].locale).toBe('de-DE'); // other locales unaffected
  });

  it('matchUnlockCode works on the structure only', async () => {
    expect(await repo.matchUnlockCode('anything')).toEqual([]);
  });
});

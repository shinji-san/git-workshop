import { describe, expect, it } from 'vitest';
import { placeholdersIn, substitute, substituteDeep } from '../../src/infrastructure/exercise/placeholders';

describe('placeholders', () => {
  const vars = { noteFile: 'notiz.txt', msg: 'Notiz angelegt', locale: 'de-DE' };

  it('substitutes ${name} and leaves shell-style $VARS alone', () => {
    expect(substitute('git add ${noteFile} # in $HOME', vars)).toBe('git add notiz.txt # in $HOME');
    expect(substitute('${locale}/${noteFile}', vars)).toBe('de-DE/notiz.txt');
    expect(substitute('nothing here', vars)).toBe('nothing here');
  });

  it('throws on an unknown placeholder, naming the location', () => {
    expect(() => substitute('${nope}', vars, 'exercise.yaml: setup[0]')).toThrow(/exercise\.yaml: setup\[0\].*\$\{nope\}/);
  });

  it('lists the placeholders used in a text (deduplicated)', () => {
    expect(placeholdersIn('${a} ${b} ${a}')).toEqual(['a', 'b']);
    expect(placeholdersIn('$a {b}')).toEqual([]);
  });

  it('substitutes deeply: string leaves, arrays and object KEYS; other leaves untouched', () => {
    const input = {
      steps: [{ id: 'x', goals: [{ type: 'commitExists', summary: '${msg}', count: 2, ok: true }] }],
      files: { '${noteFile}': 'content ${msg}' },
      nothing: null,
    };
    expect(substituteDeep(input, vars)).toEqual({
      steps: [{ id: 'x', goals: [{ type: 'commitExists', summary: 'Notiz angelegt', count: 2, ok: true }] }],
      files: { 'notiz.txt': 'content Notiz angelegt' },
      nothing: null,
    });
  });

  it('reports the path of a bad placeholder inside a nested structure', () => {
    expect(() => substituteDeep({ steps: [{ goals: [{ summary: '${nope}' }] }] }, vars, 'exercise.yaml')).toThrow(
      /exercise\.yaml\.steps\[0\]\.goals\[0\].*\$\{nope\}/,
    );
  });
});

import { describe, expect, it } from 'vitest';
import { exerciseFileSuffix } from '../../src/electron/main/exerciseFileSuffix';

describe('exerciseFileSuffix', () => {
  it('transliterates umlauts and ß', () => {
    expect(exerciseFileSuffix('Größe ändern')).toBe('Groesse-aendern');
    expect(exerciseFileSuffix('Über Ölfässer')).toBe('Ueber-Oelfaesser');
  });

  it('collapses any run of non-alphanumerics (spaces, parens, commas) to a single hyphen', () => {
    expect(exerciseFileSuffix('Git konfigurieren (Name, E-Mail, Default-Branch)')).toBe(
      'Git-konfigurieren-Name-E-Mail-Default-Branch',
    );
    expect(exerciseFileSuffix('Über: Rebase / Squash?')).toBe('Ueber-Rebase-Squash');
  });

  it('keeps existing single hyphens', () => {
    expect(exerciseFileSuffix('Feature-Branch in main mergen')).toBe('Feature-Branch-in-main-mergen');
  });

  it('trims leading and trailing separators', () => {
    expect(exerciseFileSuffix('  (Test)  ')).toBe('Test');
    expect(exerciseFileSuffix('***')).toBe('');
  });
});

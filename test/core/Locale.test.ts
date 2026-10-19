import { describe, expect, it } from 'vitest';
import { canonicalLocale, languageOf, resolveLocale, resolveUiLocale, UI_LOCALES, DEFAULT_LOCALE } from '../../src/core/i18n/Locale';

describe('canonicalLocale', () => {
  it('normalizes case and separators to BCP 47 form', () => {
    expect(canonicalLocale('de-DE')).toBe('de-DE');
    expect(canonicalLocale('de_de')).toBe('de-DE');
    expect(canonicalLocale('EN-us')).toBe('en-US');
    expect(canonicalLocale('en')).toBe('en');
    expect(canonicalLocale('de_DE.UTF-8')).toBe('de-DE'); // POSIX-style suffix dropped
  });

  it('returns undefined for unusable input', () => {
    expect(canonicalLocale('')).toBeUndefined();
    expect(canonicalLocale(undefined)).toBeUndefined();
    expect(canonicalLocale('german')).toBeUndefined();
  });
});

describe('languageOf', () => {
  it('extracts the primary language subtag', () => {
    expect(languageOf('de-DE')).toBe('de');
    expect(languageOf('en')).toBe('en');
  });
});

describe('resolveLocale', () => {
  const available = ['de-DE', 'en-US', 'fr-FR'];

  it('prefers the exact tag, then the same language, then the default, then the first', () => {
    expect(resolveLocale('en-US', available)).toBe('en-US');
    expect(resolveLocale('en-GB', available)).toBe('en-US'); // same language, other region
    expect(resolveLocale('en', available)).toBe('en-US');
    expect(resolveLocale('it-IT', available)).toBe('de-DE'); // unknown language -> DEFAULT_LOCALE
    expect(resolveLocale('it-IT', ['en-US', 'fr-FR'])).toBe('en-US'); // default unavailable -> first (sorted)
    expect(resolveLocale(undefined, available)).toBe(DEFAULT_LOCALE);
  });

  it('honours an explicit preferred fallback (exact or by language)', () => {
    expect(resolveLocale('it-IT', available, 'fr-FR')).toBe('fr-FR');
    expect(resolveLocale('it-IT', available, 'fr')).toBe('fr-FR');
  });

  it('is deterministic for sloppy input and empty availability', () => {
    expect(resolveLocale('de_de', available)).toBe('de-DE');
    expect(resolveLocale('de-DE', [])).toBeUndefined();
  });
});

describe('resolveUiLocale', () => {
  it('always lands on a UI locale', () => {
    for (const l of UI_LOCALES) expect(resolveUiLocale(l)).toBe(l);
    expect(resolveUiLocale('en-GB')).toBe('en-US');
    expect(resolveUiLocale('fr-FR')).toBe(DEFAULT_LOCALE);
    expect(resolveUiLocale(null)).toBe(DEFAULT_LOCALE);
  });
});

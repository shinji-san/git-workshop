/**
 * Locale handling (pure). Locales are BCP 47 language tags built from an ISO 639-1 language code
 * and an optional ISO 3166-1 alpha-2 region code, e.g. `de-DE`, `en-US`, `en`.
 *
 * Two layers use this:
 *  - the UI (menus, panels, checklist texts) supports a fixed set of locales (`UI_LOCALES`), so
 *    its message catalogs can be typed for completeness;
 *  - exercise packages may ship texts for ANY tag (`i18n/<tag>.yaml`); `resolveLocale` picks the
 *    best available one: exact tag → same language (any region) → preferred default → first.
 */
export type Locale = string;

/** Locales the application UI has message catalogs for. */
export const UI_LOCALES = ['de-DE', 'en-US'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

/** The workshop's original language: the default for the UI and the preferred exercise fallback. */
export const DEFAULT_LOCALE: UiLocale = 'de-DE';

/** `language[-REGION]`, e.g. `de`, `de-DE`, `en-US`. (Deliberately no script/variant subtags.) */
export const LOCALE_TAG_RE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/** Normalize sloppy input to the canonical form: `de_de` / `DE-de` → `de-DE`. Returns undefined if unusable. */
export function canonicalLocale(tag: string | undefined | null): Locale | undefined {
  if (!tag) return undefined;
  const m = tag.trim().replace('_', '-').match(/^([A-Za-z]{2,3})(?:-([A-Za-z]{2}))?(?:[-.@].*)?$/);
  if (!m) return undefined;
  return m[2] ? `${m[1].toLowerCase()}-${m[2].toUpperCase()}` : m[1].toLowerCase();
}

/** Primary language subtag: `de-DE` → `de`. */
export function languageOf(locale: Locale): string {
  return locale.split('-')[0].toLowerCase();
}

/**
 * Pick the best match for `requested` among `available`:
 *  1. the exact tag, 2. any tag with the same language, 3. `preferred` (exact, then by language),
 *  4. the first available tag (sorted, deterministic). Undefined only when nothing is available.
 */
export function resolveLocale(
  requested: string | undefined | null,
  available: readonly Locale[],
  preferred: Locale = DEFAULT_LOCALE,
): Locale | undefined {
  if (available.length === 0) return undefined;
  const sorted = [...available].sort();
  const want = canonicalLocale(requested);
  if (want) {
    const exact = sorted.find((l) => l === want);
    if (exact) return exact;
    const sameLanguage = sorted.find((l) => languageOf(l) === languageOf(want));
    if (sameLanguage) return sameLanguage;
  }
  const pref = canonicalLocale(preferred);
  if (pref) {
    const exact = sorted.find((l) => l === pref);
    if (exact) return exact;
    const sameLanguage = sorted.find((l) => languageOf(l) === languageOf(pref));
    if (sameLanguage) return sameLanguage;
  }
  return sorted[0];
}

/** Resolve to one of the UI locales (never undefined: falls back to DEFAULT_LOCALE). */
export function resolveUiLocale(requested: string | undefined | null): UiLocale {
  return (resolveLocale(requested, UI_LOCALES, DEFAULT_LOCALE) ?? DEFAULT_LOCALE) as UiLocale;
}

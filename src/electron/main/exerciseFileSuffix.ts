/**
 * Turn an exercise title into a clean, filename- and shell-safe slug: transliterate umlauts
 * (ä→ae, …), then collapse every run of non-alphanumeric characters (spaces, parentheses,
 * commas, …) into a single hyphen and trim leading/trailing hyphens. Pure and testable.
 */
export function exerciseFileSuffix(title: string): string {
  const umlauts: { [c: string]: string } = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
  return title
    .replace(/[äöüÄÖÜß]/g, (c) => umlauts[c])
    .replace(/[^A-Za-z0-9]+/g, '-') // any run of non-alphanumerics -> a single hyphen
    .replace(/^-+|-+$/g, ''); // trim leading/trailing hyphens
}

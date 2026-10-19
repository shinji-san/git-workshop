/**
 * `${name}` placeholders (pure). Exercise packages keep their structure language-neutral and put
 * every localized VALUE (file names, commit messages, branch names, …) into the texts file's
 * `vars`; this module substitutes them into structure, bundle spec and texts.
 *
 * Only the braced form is recognized, so `$HOME`-style shell variables in setup lines are left
 * alone. An unknown placeholder is an author error and throws (fail fast at load time).
 */
export type Vars = Readonly<Record<string, string>>;

export const PLACEHOLDER_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Names of all placeholders used in `text` (deduplicated, in order of appearance). */
export function placeholdersIn(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) if (!names.includes(m[1])) names.push(m[1]);
  return names;
}

/** Substitute every `${name}` in `text`; `where` names the file/field for the error message. */
export function substitute(text: string, vars: Vars, where = ''): string {
  return text.replace(PLACEHOLDER_RE, (_whole, name: string) => {
    const value = vars[name];
    if (value === undefined) {
      throw new Error(`${where ? where + ': ' : ''}Platzhalter \${${name}} ist nicht definiert (vars der Textdatei prüfen)`);
    }
    return value;
  });
}

/**
 * Deep-substitute every string of a plain JSON-like value – string leaves AND object keys (so a
 * bundle's `files: { "${noteFile}": "…" }` works). Non-string leaves are returned untouched.
 */
export function substituteDeep<T>(value: T, vars: Vars, where = ''): T {
  const walk = (v: unknown, at: string): unknown => {
    if (typeof v === 'string') return substitute(v, vars, at);
    if (Array.isArray(v)) return v.map((item, i) => walk(item, `${at}[${i}]`));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) {
        out[substitute(k, vars, at)] = walk(item, at ? `${at}.${k}` : k);
      }
      return out;
    }
    return v;
  };
  return walk(value, where) as T;
}

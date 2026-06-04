import type { CommitDetail } from '../../core/graph/GraphLayout';

/**
 * Pure copy helpers — the SINGLE source of truth for "what goes onto the clipboard" for a commit.
 * Both the native right-click context menu AND the inline copy buttons in the detail popup derive
 * their strings from here, so the two UIs can never drift apart. No DOM/Electron imports -> unit-testable
 * (the renderer modules that consume this, graph.ts, run side effects on import; this one does not).
 */

export interface CopyTarget {
  /** Stable identifier (used to attach the popup button to the right field). */
  readonly key: string;
  /** German action label — serves as both the native menu item text and the popup button's aria-label. */
  readonly label: string;
  /** The exact text written to the clipboard. */
  readonly value: string;
}

/** "Name <email>", or just the name when no email is recorded. */
function who(s: CommitDetail['author']): string {
  return s.email ? `${s.name} <${s.email}>` : s.name;
}

/**
 * The four single-field copy targets. Array order = menu/button order.
 */
export function copyTargets(c: CommitDetail): CopyTarget[] {
  return [
    { key: 'sha', label: 'SHA kopieren', value: c.oid },
    { key: 'message', label: 'Commit-Message kopieren', value: c.message },
    { key: 'author', label: 'Author kopieren', value: who(c.author) },
    { key: 'committer', label: 'Committer kopieren', value: who(c.committer) },
  ];
}

/**
 * "Alles kopieren": a single formatted block with all fields. The date formatter lives in graph.ts
 * (display concern) and is injected, so this module stays free of display specifics and testable.
 * Labels mirror the detail popup's German field labels for consistency.
 */
export function copyAll(c: CommitDetail, fmtDate: (sec: number, tz: string) => string): string {
  return [
    `SHA: ${c.oid}`,
    `Autor: ${who(c.author)}`,
    `Autor-Datum: ${fmtDate(c.author.date, c.author.tz)}`,
    `Committer: ${who(c.committer)}`,
    `Committer-Datum: ${fmtDate(c.committer.date, c.committer.tz)}`,
    '',
    c.message,
  ].join('\n');
}
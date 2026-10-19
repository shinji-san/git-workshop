import type { CommitDetail } from '../../core/graph/GraphLayout';
import type { UiMessages } from '../shared/i18n/ui';

/**
 * Pure copy helpers — the SINGLE source of truth for "what goes onto the clipboard" for a commit.
 * Both the native right-click context menu AND the inline copy buttons in the detail popup derive
 * their strings from here, so the two UIs can never drift apart. No DOM/Electron imports -> unit-testable
 * (the renderer modules that consume this, graph.ts, run side effects on import; this one does not).
 * Labels come from the UI catalog passed in, so menu and popup follow the active locale.
 */

export interface CopyTarget {
  /** Stable identifier (used to attach the popup button to the right field). */
  readonly key: string;
  /** Action label — serves as both the native menu item text and the popup button's aria-label. */
  readonly label: string;
  /** The exact text written to the clipboard. */
  readonly value: string;
}

/** The catalog keys this module needs (a narrow view keeps tests simple). */
export type CopyLabels = Pick<
  UiMessages,
  'copySha' | 'copyMessage' | 'copyAuthor' | 'copyCommitter' | 'popupSha' | 'popupAuthor' | 'popupAuthorDate' | 'popupCommitter' | 'popupCommitterDate'
>;

/** "Name <email>", or just the name when no email is recorded. */
function who(s: CommitDetail['author']): string {
  return s.email ? `${s.name} <${s.email}>` : s.name;
}

/**
 * The four single-field copy targets. Array order = menu/button order.
 */
export function copyTargets(c: CommitDetail, labels: CopyLabels): CopyTarget[] {
  return [
    { key: 'sha', label: labels.copySha, value: c.oid },
    { key: 'message', label: labels.copyMessage, value: c.message },
    { key: 'author', label: labels.copyAuthor, value: who(c.author) },
    { key: 'committer', label: labels.copyCommitter, value: who(c.committer) },
  ];
}

/**
 * "Copy all": a single formatted block with all fields. The date formatter lives in graph.ts
 * (display concern) and is injected, so this module stays free of display specifics and testable.
 * Field labels mirror the detail popup's labels for consistency.
 */
export function copyAll(c: CommitDetail, fmtDate: (sec: number, tz: string) => string, labels: CopyLabels): string {
  return [
    `${labels.popupSha}: ${c.oid}`,
    `${labels.popupAuthor}: ${who(c.author)}`,
    `${labels.popupAuthorDate}: ${fmtDate(c.author.date, c.author.tz)}`,
    `${labels.popupCommitter}: ${who(c.committer)}`,
    `${labels.popupCommitterDate}: ${fmtDate(c.committer.date, c.committer.tz)}`,
    '',
    c.message,
  ].join('\n');
}

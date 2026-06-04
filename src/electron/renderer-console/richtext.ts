/**
 * Minimal, dependency-free rich text for exercise intro/debrief/task text.
 *
 * The content is author-trusted (it comes from our own exercise YAML, like task/hints), but we
 * still HTML-escape first as defense-in-depth, then apply a tiny, fixed set of inline markup on
 * the ALREADY-ESCAPED string. This stays CSP-safe (no library, no eval) and cannot inject markup.
 *
 * Block level: blocks are separated by a blank line. A block whose every line is a bullet
 * (`- ` / `* `) becomes a <ul>; otherwise a <p> with the lines reflowed (single newline -> space,
 * Markdown soft-wrap). Inline: `code`, **bold**. Nothing else.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Inline markup, applied to an already-escaped string. `code` first so ** inside code stays literal. */
function inline(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const BULLET = /^[-*]\s+(.*)$/;

/** Turn a raw line into inline HTML (escaped + inline markup). */
function lineToHtml(raw: string): string {
  return inline(escapeHtml(raw));
}

export function richTextToHtml(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n/) // blank line -> block break
    .map((block) =>
      block
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    )
    .filter((lines) => lines.length > 0)
    .map((lines) =>
      lines.every((l) => BULLET.test(l))
        ? `<ul>${lines.map((l) => `<li>${lineToHtml(l.replace(BULLET, '$1'))}</li>`).join('')}</ul>`
        : `<p>${lineToHtml(lines.join(' '))}</p>`,
    )
    .join('');
}
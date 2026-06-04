import { describe, expect, it } from 'vitest';
import { richTextToHtml } from '../../src/electron/renderer-console/richtext';

describe('richTextToHtml', () => {
  it('wraps a single paragraph', () => {
    expect(richTextToHtml('Hallo Welt')).toBe('<p>Hallo Welt</p>');
  });

  it('splits paragraphs on a blank line and reflows single newlines to spaces', () => {
    expect(richTextToHtml('Eins\nzwei\n\nDrei')).toBe('<p>Eins zwei</p><p>Drei</p>');
  });

  it('renders a block of bullet lines as a list', () => {
    expect(richTextToHtml('- a\n- b')).toBe('<ul><li>a</li><li>b</li></ul>');
  });

  it('keeps a paragraph and a following bullet list separate', () => {
    expect(richTextToHtml('Titel:\n\n- a\n- b')).toBe('<p>Titel:</p><ul><li>a</li><li>b</li></ul>');
  });

  it('applies inline markup inside bullet items', () => {
    expect(richTextToHtml('- **x** und `y`')).toBe('<ul><li><strong>x</strong> und <code>y</code></li></ul>');
  });

  it('treats a block with mixed bullet/non-bullet lines as a paragraph', () => {
    expect(richTextToHtml('Lead:\n- a')).toBe('<p>Lead: - a</p>');
  });

  it('renders **bold** and `code`', () => {
    expect(richTextToHtml('mach `git init` genau **einmal**')).toBe(
      '<p>mach <code>git init</code> genau <strong>einmal</strong></p>',
    );
  });

  it('HTML-escapes the content (no markup injection)', () => {
    expect(richTextToHtml('<script>alert(1)</script> & "x"')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;</p>',
    );
  });

  it('keeps escaped HTML inside code spans literal', () => {
    expect(richTextToHtml('Tag `<b>` bleibt Text')).toBe('<p>Tag <code>&lt;b&gt;</code> bleibt Text</p>');
  });

  it('drops empty input', () => {
    expect(richTextToHtml('   \n\n  ')).toBe('');
  });
});
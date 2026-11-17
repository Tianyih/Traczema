import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdownLite, toggleBulletList, wrapSelection } from './markdownLite';

describe('inline parsing', () => {
  it('bold, italic, links and plain text', () => {
    expect(parseInline('a **b** c *d* [e](https://x.org/y)')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' c ' },
      { type: 'italic', children: [{ type: 'text', text: 'd' }] },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'e', href: 'https://x.org/y' },
    ]);
  });
  it('only http(s) links become links (javascript: is left as text)', () => {
    const out = parseInline('[x](javascript:alert(1))');
    expect(out.some((n) => n.type === 'link')).toBe(false);
  });
  it('HTML is never interpreted: it stays literal text', () => {
    expect(parseInline('<img src=x onerror=alert(1)>')).toEqual([{ type: 'text', text: '<img src=x onerror=alert(1)>' }]);
  });
  it('unbalanced markers are literal', () => {
    expect(parseInline('2 * 3 and **oops')).toEqual([{ type: 'text', text: '2 * 3 and **oops' }]);
  });
  it('a lone asterisk between spaces is arithmetic, not emphasis', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ type: 'text', text: '2 * 3 * 4' }]);
  });
  it('bold containing italic nests correctly', () => {
    expect(parseInline('**very *itchy***')).toEqual([{ type: 'bold', children: [{ type: 'text', text: 'very ' }, { type: 'italic', children: [{ type: 'text', text: 'itchy' }] }] }]);
  });
  it('works with Chinese text', () => {
    expect(parseInline('皮肤**很痒**')).toEqual([{ type: 'text', text: '皮肤' }, { type: 'bold', children: [{ type: 'text', text: '很痒' }] }]);
  });
});

describe('block parsing', () => {
  it('paragraphs, bullet lists, and blank-line separation', () => {
    const blocks = parseMarkdownLite('Itchy night\nwoke twice\n\n- cream\n* cold shower\n\nend');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'list', 'paragraph']);
    expect(blocks[1]).toMatchObject({ type: 'list' });
    expect((blocks[1] as { items: unknown[] }).items).toHaveLength(2);
    expect(parseMarkdownLite('')).toEqual([]);
    expect(parseMarkdownLite('a\r\nb')).toHaveLength(1);
  });
});

describe('toolbar edits', () => {
  it('wraps a selection and toggles it off again', () => {
    const wrapped = wrapSelection('very itchy', 5, 10, '**');
    expect(wrapped).toEqual({ text: 'very **itchy**', selStart: 7, selEnd: 12 });
    const back = wrapSelection(wrapped.text, wrapped.selStart, wrapped.selEnd, '**');
    expect(back.text).toBe('very itchy');
    expect(back.selStart).toBe(5);
  });
  it('an empty selection inserts a marker pair with the cursor between', () => {
    expect(wrapSelection('ab', 1, 1, '*')).toEqual({ text: 'a**b', selStart: 2, selEnd: 2 });
  });
  it('toggles bullets on all selected lines, leaving blank lines alone', () => {
    const on = toggleBulletList('one\ntwo\n\nthree', 0, 7);
    expect(on.text).toBe('- one\n- two\n\nthree');
    const off = toggleBulletList(on.text, on.selStart, on.selEnd);
    expect(off.text).toBe('one\ntwo\n\nthree');
  });
  it('does not double-bullet a line that already has one', () => {
    expect(toggleBulletList('- a\nb', 0, 5).text).toBe('- a\n- b');
  });
});

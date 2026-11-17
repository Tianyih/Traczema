/**
 * Tiny, SAFE markdown subset for notes: **bold**, *italic*, [text](https://link), "- " bullets.
 * It parses to a structure that React renders as elements — never as raw HTML — so user text can
 * never inject markup.
 */
export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'link'; href: string; text: string };

export type Block = { type: 'paragraph'; inlines: Inline[] } | { type: 'list'; items: Inline[][] };

// Emphasis markers must hug non-space characters ("2 * 3" is multiplication, not italics).
const INLINE_RE = /\*\*(?!\s)(.+?)(?<!\s)\*\*(?!\*)|(?<!\*)\*(?![\s*])(.+?)(?<![\s*])\*(?!\*)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of src.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: 'text', text: src.slice(last, index) });
    if (m[1] !== undefined) out.push({ type: 'bold', children: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ type: 'italic', children: parseInline(m[2]) });
    else out.push({ type: 'link', text: m[3] as string, href: m[4] as string });
    last = index + m[0].length;
  }
  if (last < src.length) out.push({ type: 'text', text: src.slice(last) });
  return out;
}

const BULLET_RE = /^\s*[-*]\s+(.*)$/;

export function parseMarkdownLite(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: Inline[][] | null = null;
  const flushPara = () => {
    if (para.length > 0) blocks.push({ type: 'paragraph', inlines: parseInline(para.join('\n')) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: 'list', items: list });
    list = null;
  };
  for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flushPara();
      (list ??= []).push(parseInline(bullet[1] as string));
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

// ---------- toolbar edits (pure so they are testable) ----------

export interface TextEdit {
  text: string;
  selStart: number;
  selEnd: number;
}

/** Wrap the selection in `marker` (e.g. `**`); toggles off when already wrapped. */
export function wrapSelection(text: string, start: number, end: number, marker: string): TextEdit {
  const m = marker.length;
  const before = text.slice(0, start);
  const sel = text.slice(start, end);
  const after = text.slice(end);
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return { text: before.slice(0, -m) + sel + after.slice(m), selStart: start - m, selEnd: end - m };
  }
  return { text: before + marker + sel + marker + after, selStart: start + m, selEnd: end + m };
}

/** Toggle "- " bullets on every line touched by the selection. */
export function toggleBulletList(text: string, start: number, end: number): TextEdit {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  const lineEnd = nl === -1 ? text.length : nl;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  const allBulleted = nonEmpty.length > 0 && nonEmpty.every((l) => BULLET_RE.test(l));
  const next = lines.map((l) => {
    if (l.trim() === '') return l;
    return allBulleted ? l.replace(/^(\s*)[-*]\s+/, '$1') : BULLET_RE.test(l) ? l : `- ${l}`;
  });
  const replaced = next.join('\n');
  return {
    text: text.slice(0, lineStart) + replaced + text.slice(lineEnd),
    selStart: lineStart,
    selEnd: lineStart + replaced.length,
  };
}

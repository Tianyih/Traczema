import { useRef, useState, type ReactNode } from 'react';
import { Bold, Eye, Italic, List, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { useLanguage } from '@/i18n/LanguageContext';
import { parseMarkdownLite, toggleBulletList, wrapSelection, type Inline, type TextEdit } from '@/lib/markdownLite';
import { Section } from '../fields';
import type { SectionProps } from '../types';

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'text':
        return n.text;
      case 'bold':
        return <strong key={i}>{renderInline(n.children)}</strong>;
      case 'italic':
        return <em key={i}>{renderInline(n.children)}</em>;
      case 'link':
        return (
          <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {n.text}
          </a>
        );
    }
  });
}

/** Safe renderer: elements only, never raw HTML. */
export function MarkdownView({ source }: { source: string }) {
  const blocks = parseMarkdownLite(source);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, i) =>
        b.type === 'paragraph' ? (
          <p key={i} className="whitespace-pre-wrap">
            {renderInline(b.inlines)}
          </p>
        ) : (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

export function NotesSection({ log, update }: SectionProps) {
  const { t } = useLanguage();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const apply = (edit: (text: string, a: number, b: number) => TextEdit) => {
    const el = ref.current;
    if (!el) return;
    const next = edit(log.notes, el.selectionStart, el.selectionEnd);
    update((l) => ({ ...l, notes: next.text }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.selStart, next.selEnd);
    });
  };

  return (
    <Section title={t('sec_notes')}>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="iconSm" aria-label={t('notes_bold')} title={t('notes_bold')} disabled={preview} onClick={() => apply((x, a, b) => wrapSelection(x, a, b, '**'))}>
          <Bold />
        </Button>
        <Button variant="outline" size="iconSm" aria-label={t('notes_italic')} title={t('notes_italic')} disabled={preview} onClick={() => apply((x, a, b) => wrapSelection(x, a, b, '*'))}>
          <Italic />
        </Button>
        <Button variant="outline" size="iconSm" aria-label={t('notes_list')} title={t('notes_list')} disabled={preview} onClick={() => apply(toggleBulletList)}>
          <List />
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
          {preview ? <Pencil /> : <Eye />} {preview ? t('notes_edit') : t('notes_preview')}
        </Button>
      </div>
      {preview ? (
        <div data-testid="notes-preview" className="min-h-28 rounded-md border bg-muted/40 p-3">
          {log.notes.trim() ? <MarkdownView source={log.notes} /> : <p className="text-sm text-muted-foreground">{t('notes_empty_preview')}</p>}
        </div>
      ) : (
        <Textarea
          ref={ref}
          data-testid="notes-input"
          aria-label={t('sec_notes')}
          placeholder={t('notes_placeholder')}
          value={log.notes}
          onChange={(e) => update((l) => ({ ...l, notes: e.target.value }))}
        />
      )}
    </Section>
  );
}

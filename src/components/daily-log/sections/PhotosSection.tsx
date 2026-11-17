import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Tag, Trash2 } from 'lucide-react';
import { BlobImage } from '@/components/common/BlobImage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PHOTO_TAGS, type PhotoTagRef } from '@/db/types';
import { useTags } from '@/hooks/useTags';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { toggleIn } from '@/lib/dailyLogDraft';
import { Chip, CustomTagAdder, Notice, Section } from '../fields';
import type { PhotoDraft } from '../types';

function PhotoCard({ photo, index, onChange, onRemove }: { photo: PhotoDraft; index: number; onChange: (patch: Partial<PhotoDraft>) => void; onRemove: () => void }) {
  const { t } = useLanguage();
  const custom = useTags('photo');
  const [editing, setEditing] = useState(false);
  const label = (tag: PhotoTagRef) => (tag.startsWith('custom:') ? (custom.labels.get(tag as `custom:${string}`) ?? tag) : t(`phototag_${tag}` as MessageKey));
  const toggle = (tag: PhotoTagRef) => onChange({ tags: toggleIn(photo.tags, tag) });

  return (
    <li data-testid="photo-card" className="space-y-2 rounded-lg border p-2">
      <div className="relative">
        <BlobImage blob={photo.thumb} alt={t('photo_alt', { n: index + 1 })} className="aspect-[4/3] w-full rounded-md object-cover" />
        <Button variant="secondary" size="iconSm" className="absolute right-1.5 top-1.5 bg-card/90" aria-label={`${t('photo_remove')} ${index + 1}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {photo.tags.map((tag) => (
          <span key={tag} className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
            {label(tag)}
          </span>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
          <Tag /> {t('photo_tags')}
        </Button>
      </div>
      {editing && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {PHOTO_TAGS.map((tag) => (
              <Chip key={tag} selected={photo.tags.includes(tag)} onClick={() => toggle(tag)}>
                {t(`phototag_${tag}`)}
              </Chip>
            ))}
            {custom.refs.map((ref) => (
              <Chip key={ref} selected={photo.tags.includes(ref)} onClick={() => toggle(ref)}>
                {custom.labels.get(ref)}
              </Chip>
            ))}
          </div>
          <CustomTagAdder label={t('photo_tag_new')} placeholder={t('photo_tag_new')} onAdd={async (l) => toggle(await custom.add(l))} />
        </div>
      )}
      <Input aria-label={t('photo_caption')} placeholder={t('photo_caption')} value={photo.caption} maxLength={200} onChange={(e) => onChange({ caption: e.target.value })} className="h-9" />
    </li>
  );
}

export interface PhotosSectionProps {
  photos: PhotoDraft[];
  busy: boolean;
  errorKey: MessageKey | null;
  onAddFiles: (files: File[]) => void;
  onChange: (id: string, patch: Partial<PhotoDraft>) => void;
  onRemove: (id: string) => void;
}

export function PhotosSection({ photos, busy, errorKey, onAddFiles, onChange, onRemove }: PhotosSectionProps) {
  const { t } = useLanguage();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <Section title={t('sec_photos')}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onAddFiles([...e.dataTransfer.files]);
        }}
        className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${dragging ? 'border-primary bg-accent' : ''}`}
      >
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="photo-input"
          onChange={(e) => {
            onAddFiles([...(e.target.files ?? [])]);
            e.target.value = ''; // allow re-selecting the same file
          }}
        />
        <Button variant="outline" onClick={() => input.current?.click()} disabled={busy} data-testid="photo-add">
          {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} {busy ? t('photo_processing') : t('photo_add')}
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">{t('photo_hint')}</p>
      </div>
      {errorKey && <Notice tone="error" testId="photo-error">{t(errorKey)}</Notice>}
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3" data-testid="photo-list">
          {photos.map((p, i) => (
            <PhotoCard key={p.id} photo={p} index={i} onChange={(patch) => onChange(p.id, patch)} onRemove={() => onRemove(p.id)} />
          ))}
        </ul>
      )}
    </Section>
  );
}

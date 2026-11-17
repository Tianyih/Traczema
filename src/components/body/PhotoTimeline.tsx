import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BlobImage } from '@/components/common/BlobImage';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { BodyPartLog, PhotoRecord, PhotoTagRef, RegionId } from '@/db/types';
import { useTags } from '@/hooks/useTags';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { statusOnDate } from '@/lib/regionObservation';
import { StatusChip } from './StatusChip';

export function PhotoTimeline({ photos, logs, regionId }: { photos: readonly PhotoRecord[]; logs: readonly BodyPartLog[]; regionId: RegionId }) {
  const { t, tn, formatDate } = useLanguage();
  const custom = useTags('photo');
  const [open, setOpen] = useState<number | null>(null);
  const tagLabel = (tag: PhotoTagRef) => (tag.startsWith('custom:') ? (custom.labels.get(tag as `custom:${string}`) ?? tag) : t(`phototag_${tag}` as MessageKey));

  if (photos.length === 0) return <p className="text-sm text-muted-foreground">{t('timeline_empty')}</p>;
  const current = open === null ? null : photos[open];
  const status = current ? statusOnDate(logs, regionId, current.date) : null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{tn('timeline_count', photos.length)}</p>
      <ol className="flex gap-3 overflow-x-auto pb-2" data-testid="photo-timeline" aria-label={t('timeline_title')}>
        {photos.map((p, i) => {
          const st = statusOnDate(logs, regionId, p.date);
          return (
            <li key={p.id} className="w-28 shrink-0" data-testid="timeline-photo" data-date={p.date}>
              <button type="button" onClick={() => setOpen(i)} aria-label={t('timeline_photo_open', { date: formatDate(p.date, 'fmt_date_year') })} className="block w-full overflow-hidden rounded-lg border hover:shadow-md">
                <BlobImage blob={p.thumb} alt="" className="aspect-[4/3] w-full object-cover" />
              </button>
              <p className="mt-1 text-xs tabular-nums">{formatDate(p.date, 'fmt_date_year')}</p>
              {st && <StatusChip status={st} className="mt-0.5 px-1.5 py-0.5 text-[10px]" />}
            </li>
          );
        })}
      </ol>

      <Dialog open={current !== undefined && current !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {current && (
          <DialogContent closeLabel={t('viewer_close')} data-testid="photo-viewer" aria-describedby={undefined}>
            <DialogTitle className="mb-2 pr-10 text-sm font-semibold">{formatDate(current.date, 'fmt_full_date')}</DialogTitle>
            <DialogDescription className="sr-only">{current.caption || t('timeline_title')}</DialogDescription>
            <div className="relative">
              <BlobImage blob={current.blob} alt={current.caption || formatDate(current.date, 'fmt_full_date')} className="max-h-[70vh] w-full rounded-lg object-contain" />
              <Button variant="secondary" size="icon" aria-label={t('cal_prev')} className="absolute left-2 top-1/2 -translate-y-1/2 bg-card/90" disabled={open === 0} onClick={() => setOpen((i) => (i === null ? i : Math.max(0, i - 1)))}>
                <ChevronLeft />
              </Button>
              <Button variant="secondary" size="icon" aria-label={t('cal_next')} className="absolute right-2 top-1/2 -translate-y-1/2 bg-card/90" disabled={open === photos.length - 1} onClick={() => setOpen((i) => (i === null ? i : Math.min(photos.length - 1, i + 1)))}>
                <ChevronRight />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              {status && <StatusChip status={status} />}
              {current.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">{tagLabel(tag)}</span>
              ))}
              {current.caption && <span className="text-muted-foreground">{current.caption}</span>}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

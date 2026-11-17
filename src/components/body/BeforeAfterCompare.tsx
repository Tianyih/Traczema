import { useMemo, useState } from 'react';
import { BlobImage } from '@/components/common/BlobImage';
import { Segmented } from '@/components/daily-log/fields';
import type { BodyPartLog, PhotoRecord, RegionId } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import { daysApart, statusOnDate } from '@/lib/regionObservation';
import { StatusChip } from './StatusChip';

type Mode = 'side' | 'slider';

/** Two photos of the same body part, before and after: side by side or with a draggable divider. */
export function BeforeAfterCompare({ photos, logs, regionId }: { photos: readonly PhotoRecord[]; logs: readonly BodyPartLog[]; regionId: RegionId }) {
  const { t, tn, formatDate } = useLanguage();
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('side');
  const [pos, setPos] = useState(50);

  const before = useMemo(() => photos.find((p) => p.id === beforeId) ?? photos[0], [photos, beforeId]);
  const after = useMemo(() => photos.find((p) => p.id === afterId) ?? photos[photos.length - 1], [photos, afterId]);

  if (photos.length < 2 || !before || !after) return <p className="text-sm text-muted-foreground">{t('compare_need_two')}</p>;

  const label = (p: PhotoRecord) => {
    const st = statusOnDate(logs, regionId, p.date);
    return `${formatDate(p.date, 'fmt_date_year')}${st ? ` · ${t(`status_${st}`)}` : ''}`;
  };
  const caption = (p: PhotoRecord, heading: string) => {
    const st = statusOnDate(logs, regionId, p.date);
    return (
      <figcaption className="mt-1.5 space-y-1 text-xs">
        <span className="font-semibold">{heading}</span> <span className="tabular-nums text-muted-foreground">{formatDate(p.date, 'fmt_date_year')}</span>
        {st && <div><StatusChip status={st} /></div>}
      </figcaption>
    );
  };

  return (
    <div className="space-y-3" data-testid="compare">
      <div className="grid grid-cols-2 gap-2">
        {([['before', before, setBeforeId, 'compare_pick_before'], ['after', after, setAfterId, 'compare_pick_after']] as const).map(([key, current, setter, aria]) => (
          <select
            key={key}
            data-testid={`compare-${key}`}
            aria-label={t(aria)}
            value={current.id}
            onChange={(e) => setter(e.target.value)}
            className="h-10 rounded-md border border-input bg-card px-2 text-sm"
          >
            {photos.map((p) => (
              <option key={p.id} value={p.id}>{label(p)}</option>
            ))}
          </select>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p data-testid="compare-apart" data-days={daysApart(before.date, after.date)} className="text-sm font-medium">
          {t('compare_apart', { days: tn('days', daysApart(before.date, after.date)) })}
        </p>
        <div className="w-56">
          <Segmented<Mode>
            testId="compare-mode"
            ariaLabel={t('compare_title')}
            value={mode}
            onChange={(m) => m && setMode(m)}
            options={[{ value: 'side', label: t('compare_mode_side') }, { value: 'slider', label: t('compare_mode_slider') }]}
          />
        </div>
      </div>

      {mode === 'side' ? (
        <div className="grid grid-cols-2 gap-3" data-testid="compare-side">
          <figure><BlobImage blob={before.blob} alt={t('compare_before')} className="aspect-[4/3] w-full rounded-lg object-cover" />{caption(before, t('compare_before'))}</figure>
          <figure><BlobImage blob={after.blob} alt={t('compare_after')} className="aspect-[4/3] w-full rounded-lg object-cover" />{caption(after, t('compare_after'))}</figure>
        </div>
      ) : (
        <div data-testid="compare-slider-view">
          <div className="relative aspect-[4/3] w-full select-none overflow-hidden rounded-lg">
            <BlobImage blob={after.blob} alt={t('compare_after')} className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
              <BlobImage blob={before.blob} alt={t('compare_before')} className="size-full object-cover" />
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${pos}%` }} />
            <span className="absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">{t('compare_before')}</span>
            <span className="absolute right-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">{t('compare_after')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              data-testid="compare-range"
              aria-label={t('compare_slider_aria')}
              onChange={(e) => setPos(Number(e.target.value))}
              className="absolute inset-0 size-full cursor-ew-resize opacity-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}

import { REGION_IDS, type RegionId } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import type { RegionSummary } from '@/lib/derive/regionTimeline';
import { cn } from '@/lib/utils';
import { statusDotStyle } from './statusStyles';

/** Every body part as a button: the keyboard / touch-friendly twin of the map. */
export function RegionList({ summaries, selected, onSelect }: { summaries: Record<RegionId, RegionSummary> | null; selected: RegionId | null; onSelect: (r: RegionId) => void }) {
  const { t } = useLanguage();
  return (
    <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" data-testid="region-list" aria-label={t('body_all_regions')}>
      {REGION_IDS.map((id) => {
        const s = summaries?.[id];
        const status = s?.currentStatus ?? 'clear';
        return (
          <li key={id}>
            <button
              type="button"
              data-testid={`region-btn-${id}`}
              aria-pressed={selected === id}
              onClick={() => onSelect(id)}
              className={cn('flex min-h-11 w-full items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm leading-tight hover:bg-muted', selected === id && 'border-primary bg-accent/50')}
            >
              <span aria-hidden className="size-3 shrink-0 rounded-full border border-black/20" style={statusDotStyle(status)} />
              <span className="min-w-0 flex-1 break-words">{t(`region_${id}`)}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{s && s.episodeCount > 0 ? t(`status_${status}`) : ''}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

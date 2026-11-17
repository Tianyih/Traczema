import { useEffect, useMemo, useRef, useState } from 'react';
import { TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/daily-log/fields';
import { listBodyPartLogs } from '@/db/repos/bodyPartRepo';
import { loadObservationPhotos } from '@/db/repos/regionRepo';
import type { BodyPartLog, PhotoRecord, RegionId } from '@/db/types';
import { useDb } from '@/hooks/useDb';
import { useDbQuery } from '@/hooks/useDbQuery';
import { useLanguage } from '@/i18n/LanguageContext';
import type { ISODate } from '@/lib/date';
import type { RegionSummary } from '@/lib/derive/regionTimeline';
import { isStale, regionLogs } from '@/lib/regionObservation';
import { BeforeAfterCompare } from './BeforeAfterCompare';
import { EpisodeList } from './EpisodeList';
import { ObservationForm } from './ObservationForm';
import { ObservationHistory } from './ObservationHistory';
import { PhotoTimeline } from './PhotoTimeline';
import { RegionMetrics } from './RegionMetrics';
import { StatusChip } from './StatusChip';

/**
 * The form needs the CURRENT stored state when it (re)mounts. Live-query results can lag a write that
 * just finished, so the form's initial data is read with a one-shot query keyed by region / date /
 * version instead.
 */
function useFreshFormData(regionId: RegionId, date: ISODate, version: number) {
  const { db } = useDb();
  const key = `${db.name}|${regionId}|${date}|${version}`;
  const [state, setState] = useState<{ key: string; logs: BodyPartLog[]; photos: PhotoRecord[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [logs, photos] = await Promise.all([listBodyPartLogs(db, regionId), loadObservationPhotos(db, regionId, date)]);
      if (!cancelled) setState({ key, logs, photos });
    })();
    return () => {
      cancelled = true;
    };
  }, [db, regionId, date, key]);
  return state?.key === key ? state : null;
}

export interface RegionPanelProps {
  regionId: RegionId;
  summary: RegionSummary;
  /** All body-part observations (live), for the history and photo-status lookups. */
  allLogs: readonly BodyPartLog[];
  today: ISODate;
  onClose: () => void;
}

export function RegionPanel({ regionId, summary, allLogs, today, onClose }: RegionPanelProps) {
  const { t, formatDate } = useLanguage();
  const logs = useMemo(() => regionLogs(allLogs, regionId), [allLogs, regionId]);
  const photos = useDbQuery((db) => db.photos.where('regionId').equals(regionId).toArray(), [regionId]);
  const sortedPhotos = useMemo(() => [...(photos ?? [])].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1)), [photos]);

  const [formDate, setFormDate] = useState<ISODate>(today);
  const [version, setVersion] = useState(0);
  const formRef = useRef<HTMLDivElement>(null);
  const fresh = useFreshFormData(regionId, formDate, version);

  const edit = (date: ISODate) => {
    setFormDate(date);
    formRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  const skinHistory = logs.filter((l) => l.residualSkin.length > 0).reverse().slice(0, 6);
  const name = t(`region_${regionId}`);

  return (
    <div className="space-y-4" data-testid="region-panel" data-region={regionId}>
      <header className="flex flex-wrap items-start gap-3 rounded-xl border bg-card p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <h3 className="text-lg font-semibold" data-testid="region-name">{name}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip testId="region-status" status={summary.currentStatus} />
            {(summary.currentStatus === 'active' || summary.currentStatus === 'healing') && (
              <span className="text-sm text-muted-foreground">{t('region_local_severity')}: <strong className="text-foreground">{summary.currentSeverity}/10</strong></span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {summary.lastLogDate ? t('region_last_observation', { date: formatDate(summary.lastLogDate, 'fmt_date_year') }) : t('region_never_observed')}
          </p>
          {isStale(summary) && (
            <p data-testid="stale-nudge" className="flex items-center gap-2 rounded-md bg-warning px-3 py-2 text-xs text-warning-foreground">
              <TriangleAlert className="size-4 shrink-0" /> {t('region_stale_nudge', { days: summary.daysSinceLastLog ?? 0 })}
            </p>
          )}
        </div>
        <Button variant="ghost" size="iconSm" aria-label={t('body_close_panel')} onClick={onClose} data-testid="region-close">
          <X />
        </Button>
      </header>

      <RegionMetrics summary={summary} />

      <Section title={t('skin_section_title')}>
        {summary.residualSkinNow.length > 0 ? (
          <div className="flex flex-wrap gap-2" data-testid="skin-now">
            {summary.residualSkinNow.map((s) => (
              <span key={s} className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">{t(`skin_${s}`)}</span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" data-testid="skin-now-empty">{t('skin_section_empty')}</p>
        )}
        {skinHistory.length > 0 && (
          <ul className="space-y-1.5 border-t pt-3" data-testid="skin-history">
            {skinHistory.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 text-xs">
                <span className="w-28 tabular-nums text-muted-foreground">{formatDate(l.date, 'fmt_date_year')}</span>
                {l.residualSkin.map((s) => (
                  <span key={s} className="rounded-full bg-muted px-2 py-0.5">{t(`skin_${s}`)}</span>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div ref={formRef} className="scroll-mt-20">
        {fresh ? (
          <ObservationForm
            key={`${regionId}|${formDate}|${version}`}
            regionId={regionId}
            date={formDate}
            today={today}
            logs={fresh.logs}
            photos={fresh.photos}
            onDateChange={setFormDate}
            onDeleted={() => {
              setFormDate(today);
              setVersion((v) => v + 1);
            }}
          />
        ) : (
          <div className="h-40 animate-pulse rounded-xl border bg-card" aria-hidden />
        )}
      </div>

      <Section title={t('episodes_title')}>
        <EpisodeList episodes={summary.episodes} />
      </Section>

      <Section title={t('timeline_title')}>
        <PhotoTimeline photos={sortedPhotos} logs={logs} regionId={regionId} />
      </Section>

      <Section title={t('compare_title')}>
        <BeforeAfterCompare photos={sortedPhotos} logs={logs} regionId={regionId} />
      </Section>

      <Section title={t('history_title')}>
        <ObservationHistory logs={logs} onEdit={edit} />
      </Section>
    </div>
  );
}

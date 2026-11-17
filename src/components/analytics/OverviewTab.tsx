import { useMemo, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { OVERLAY_TRACKS, TRACK_DEFS, type FactorDef, type OverlayTrackId } from '@/lib/analytics';
import { headline, rangeStart, sliceFrames, type AnalyticsParams } from '@/lib/analytics/view';
import { todayISO } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';
import type { CustomRef } from '@/db/types';
import { Chip } from '@/components/daily-log/fields';
import { LegendKey, VizCard } from './BarRows';
import { StatTiles } from './StatTiles';
import { buildRows, SeriesTable, SeverityChart, TrackChart } from './TimeSeriesCharts';
import { TriggerRanking } from './TriggerRanking';
import { useVizTheme } from './vizTheme';

export function OverviewTab({ frames, factors, params, customLabels }: { frames: readonly DayFrame[]; factors: readonly FactorDef[]; params: AnalyticsParams; customLabels: ReadonlyMap<CustomRef, string> }) {
  const { t } = useLanguage();
  const theme = useVizTheme();
  const [tracks, setTracks] = useState<OverlayTrackId[]>(['bedding_days']);

  const visible = useMemo(() => sliceFrames(frames, rangeStart(params.range, todayISO())), [frames, params.range]);
  const rows = useMemo(() => buildRows(visible), [visible]);
  const head = useMemo(() => headline(visible), [visible]);
  // keep the toggle order stable (entity order), not the click order
  const active = OVERLAY_TRACKS.filter((id) => tracks.includes(id as OverlayTrackId)) as OverlayTrackId[];

  return (
    <div className="space-y-4">
      <StatTiles headline={head} />

      <VizCard testId="severity-card" title={t('chart_severity_title')} subtitle={
          <ul className="flex flex-wrap gap-x-4 gap-y-1" data-testid="severity-legend" aria-label="legend">
            <LegendKey kind="hline" color="var(--viz-muted)">{t('chart_flare_threshold')}</LegendKey>
            <LegendKey kind="line" color="var(--viz-axis)">{t('chart_wash_marker')}</LegendKey>
          </ul>
        }>
        <div className="space-y-4">
          <SeverityChart rows={rows} showXAxis={active.length === 0} />

          <div className="space-y-3 border-t pt-3" style={{ borderColor: theme.grid }}>
            <div>
              <h4 className="text-sm font-semibold">{t('tracks_title')}</h4>
              <p className="text-xs text-[var(--viz-ink-2)]">{t('tracks_hint')}</p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('tracks_title')} data-testid="track-toggles">
              {OVERLAY_TRACKS.map((id) => (
                <Chip
                  key={id}
                  testId={`track-toggle-${id}`}
                  selected={tracks.includes(id as OverlayTrackId)}
                  onClick={() => setTracks((cur) => (cur.includes(id as OverlayTrackId) ? cur.filter((x) => x !== id) : [...cur, id as OverlayTrackId]))}
                >
                  <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: theme.series[id as OverlayTrackId] }} />
                  {t(TRACK_DEFS[id as OverlayTrackId].labelKey as MessageKey)}
                </Chip>
              ))}
            </div>
            {active.length === 0 ? (
              <p className="text-xs text-[var(--viz-ink-2)]">{t('tracks_none')}</p>
            ) : (
              <div className="space-y-2" data-testid="tracks">
                {active.map((id, i) => (
                  <TrackChart key={id} id={id} rows={rows} showXAxis={i === active.length - 1} />
                ))}
              </div>
            )}
          </div>
          <SeriesTable rows={rows} tracks={active} />
        </div>
      </VizCard>

      <TriggerRanking frames={frames} factors={factors} params={params} customLabels={customLabels} />
    </div>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BodyLegend } from '@/components/body/BodyLegend';
import { BodyMap } from '@/components/body/BodyMap';
import { RegionList } from '@/components/body/RegionList';
import { RegionPanel } from '@/components/body/RegionPanel';
import { StatusChip } from '@/components/body/StatusChip';
import { REGION_IDS, type RegionId } from '@/db/types';
import { useDbQuery } from '@/hooks/useDbQuery';
import { useLanguage } from '@/i18n/LanguageContext';
import { todayISO } from '@/lib/date';
import { deriveAllRegionSummaries } from '@/lib/derive/regionTimeline';

const isRegionId = (v: string | null): v is RegionId => v !== null && (REGION_IDS as readonly string[]).includes(v);

export function BodyPage() {
  const { t, tn } = useLanguage();
  const today = todayISO();
  const [params, setParams] = useSearchParams();
  const regionParam = params.get('region');
  const selected = isRegionId(regionParam) ? regionParam : null;

  const logs = useDbQuery((db) => db.bodyPartLogs.toArray());
  const summaries = useMemo(() => (logs ? deriveAllRegionSummaries(logs, today) : null), [logs, today]);

  const select = (region: RegionId) => setParams({ region }, { replace: true });
  const close = () => setParams({}, { replace: true });

  // On narrow screens the panel sits below the map: bring it into view when a region is chosen.
  const panelRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (selected && window.matchMedia('(max-width: 1023px)').matches) {
      panelRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }
  }, [selected]);

  const affected = summaries ? REGION_IDS.filter((id) => summaries[id].currentStatus === 'active' || summaries[id].currentStatus === 'healing') : [];
  const activeCount = affected.filter((id) => summaries?.[id].currentStatus === 'active').length;
  const healingCount = affected.length - activeCount;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-xl font-semibold">{t('body_page_title')}</h2>
        <p className="text-sm text-muted-foreground">{t('body_page_intro')}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-3">
            {(['anterior', 'posterior'] as const).map((view) => (
              <figure key={view} className="min-w-0">
                <BodyMap view={view} summaries={summaries} selected={selected} onSelect={select} />
                <figcaption className="mt-1 text-center text-xs font-medium text-muted-foreground">{t(view === 'anterior' ? 'body_view_anterior' : 'body_view_posterior')}</figcaption>
              </figure>
            ))}
          </div>

          <BodyLegend />

          <div data-testid="body-summary" className="rounded-xl border bg-card p-3 text-sm">
            {affected.length === 0 ? (
              <p className="text-muted-foreground">{t('body_summary_none')}</p>
            ) : (
              <div className="space-y-2">
                <p className="font-medium">
                  {[activeCount > 0 ? tn('cal_flares', activeCount) : null, healingCount > 0 ? tn('body_summary_healing', healingCount) : null].filter(Boolean).join(' · ')}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {affected.map((id) => (
                    <li key={id}>
                      <button type="button" onClick={() => select(id)} className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-muted">
                        {t(`region_${id}`)} <StatusChip status={summaries?.[id].currentStatus ?? 'clear'} className="bg-transparent p-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <RegionList summaries={summaries} selected={selected} onSelect={select} />
        </div>

        <div ref={panelRef} className="min-w-0 scroll-mt-20">
          {selected && summaries ? (
            <RegionPanel key={selected} regionId={selected} summary={summaries[selected]} allLogs={logs ?? []} today={today} onClose={close} />
          ) : (
            <div className="rounded-xl border border-dashed bg-card p-8 text-center text-muted-foreground" data-testid="body-prompt">
              {t('body_select_prompt')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

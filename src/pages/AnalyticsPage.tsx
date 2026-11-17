import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, DatabaseZap } from 'lucide-react';
import { AnalyticsFilters } from '@/components/analytics/AnalyticsFilters';
import { ForwardExplorer } from '@/components/analytics/ForwardExplorer';
import { OverviewTab } from '@/components/analytics/OverviewTab';
import { ReverseExplorer } from '@/components/analytics/ReverseExplorer';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { useDemoActions } from '@/hooks/useDemoActions';
import { useLanguage } from '@/i18n/LanguageContext';
import { ANALYTICS_TABS, parseAnalyticsParams, toSearchParams, type AnalyticsParams, type AnalyticsTab } from '@/lib/analytics/view';
import type { MessageKey } from '@/i18n';

export function AnalyticsPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseAnalyticsParams(search), [search]);
  const data = useAnalyticsData();
  const { load, busy } = useDemoActions();

  // All state lives in the URL, so every view (tab, lag, variable, tier, body part) is linkable and survives reload.
  const update = (patch: Partial<AnalyticsParams>) => setSearch(toSearchParams({ ...params, ...patch }), { replace: true });

  const loading = data.frames === undefined;
  const empty = !loading && data.severityDays === 0;

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-xl font-semibold">{t('an_title')}</h2>
        <p className="text-sm text-muted-foreground">{t('an_intro')}</p>
      </header>

      {loading ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground" data-testid="analytics-loading">{t('an_loading')}</p>
      ) : empty ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed bg-card p-6" data-testid="analytics-empty">
          <BarChart3 className="size-9 text-muted-foreground" aria-hidden />
          <div className="min-w-48 flex-1">
            <p className="font-medium">{t('an_empty_title')}</p>
            <p className="text-sm text-muted-foreground">{t('an_empty_body')}</p>
          </div>
          <Button variant="outline" disabled={busy} onClick={() => void load()} data-testid="analytics-load-demo">
            <DatabaseZap /> {busy ? t('demo_loading') : t('demo_load')}
          </Button>
        </div>
      ) : (
        <>
          <AnalyticsFilters params={params} onChange={update} />
          <Tabs value={params.tab} onValueChange={(v) => update({ tab: v as AnalyticsTab })}>
            <TabsList aria-label={t('an_title')}>
              {ANALYTICS_TABS.map((tab) => (
                <TabsTrigger key={tab} value={tab} data-testid={`tab-${tab}`}>
                  {t(`tab_${tab}` as MessageKey)}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="overview">
              <OverviewTab frames={data.frames ?? []} factors={data.factors} params={params} customLabels={data.customLabels} />
            </TabsContent>
            <TabsContent value="forward">
              <ForwardExplorer frames={data.frames ?? []} registry={data.registry} params={params} onChange={update} customLabels={data.customLabels} />
            </TabsContent>
            <TabsContent value="reverse">
              <ReverseExplorer frames={data.frames ?? []} factors={data.factors} params={params} onChange={update} customLabels={data.customLabels} />
            </TabsContent>
          </Tabs>

          <aside className="space-y-2 rounded-xl border bg-card p-3 text-xs text-muted-foreground" data-testid="analytics-caveat">
            <p className="font-medium text-foreground">{t('an_caveat')}</p>
            <p>{t('an_stats_note')}</p>
            <details>
              <summary className="cursor-pointer font-medium text-foreground">{t('an_howto_title')}</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>{t('an_howto_lift')}</li>
                <li>{t('an_howto_lag')}</li>
                <li>{t('an_howto_evidence')}</li>
              </ul>
            </details>
          </aside>
        </>
      )}
    </div>
  );
}

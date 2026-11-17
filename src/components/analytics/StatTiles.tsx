import { useLanguage } from '@/i18n/LanguageContext';
import type { Headline } from '@/lib/analytics/view';

function Tile({ id, label, value, sub }: { id: string; label: string; value: string; sub?: string }) {
  return (
    <div data-testid={`stat-${id}`} className="viz-root rounded-xl border p-3">
      <p className="text-xs text-[var(--viz-ink-2)]">{label}</p>
      {/* big standalone numbers keep proportional figures (tabular-nums is for columns) */}
      <p className="mt-1 text-2xl font-semibold leading-none">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--viz-ink-2)]">{sub}</p>}
    </div>
  );
}

export function StatTiles({ headline }: { headline: Headline }) {
  const { t, formatNumber } = useLanguage();
  const dash = '—';
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile id="days" label={t('stat_logged_days')} value={String(headline.loggedDays)} />
      <Tile id="avg" label={t('stat_avg')} value={headline.mean === null ? dash : formatNumber(headline.mean, { maximumFractionDigits: 1 })} sub="/ 10" />
      <Tile id="flare-days" label={t('stat_flare_days')} value={String(headline.flareDays)} />
      <Tile id="flare-rate" label={t('stat_flare_rate')} value={headline.flareRate === null ? dash : formatNumber(headline.flareRate, { style: 'percent', maximumFractionDigits: 0 })} />
    </div>
  );
}

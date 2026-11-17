import { useLanguage } from '@/i18n/LanguageContext';
import { HEAT_INK, severityColor } from '@/lib/heat';
import type { Episode } from '@/lib/derive/regionTimeline';

function EpisodeCard({ episode }: { episode: Episode }) {
  const { t, tn, formatDate } = useLanguage();
  const range = t('episode_range', {
    start: formatDate(episode.startDate, 'fmt_date_year'),
    end: episode.endDate ? formatDate(episode.endDate, 'fmt_date_year') : t('episode_ongoing'),
  });
  const total = Math.max(1, episode.daysAffected);
  return (
    <li
      data-testid="episode-card"
      data-index={episode.index}
      data-days={episode.daysAffected}
      data-active-days={episode.daysActive}
      data-healing-days={episode.daysHealing}
      data-recurrence={episode.isRecurrence}
      className="space-y-2 rounded-lg border bg-card p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">{t('episode_title', { n: episode.index })}</h4>
        {episode.isRecurrence && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">{t('metric_recurrence_badge', { n: episode.index - 1 })}</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{range}</span>
      </div>

      {/* Active vs healing share of the episode */}
      <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${t('episode_active_days', { days: episode.daysActive })}, ${t('episode_healing_days', { days: episode.daysHealing })}`}>
        <span style={{ width: `${(episode.daysActive / total) * 100}%`, background: severityColor(7) }} />
        <span style={{ width: `${(episode.daysHealing / total) * 100}%`, background: severityColor(3) }} className="opacity-70" />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t('episode_total', { days: tn('days', episode.daysAffected) })}</span>
        <span>{t('episode_active_days', { days: episode.daysActive })}</span>
        <span>{t('episode_healing_days', { days: episode.daysHealing })}</span>
        <span className="inline-flex items-center gap-1">
          <span className="rounded px-1.5 py-0.5 font-semibold" style={{ background: severityColor(episode.peakSeverity), color: HEAT_INK }}>{episode.peakSeverity}</span>
          {t('episode_peak', { n: episode.peakSeverity })}
        </span>
        {episode.remissionBeforeDays !== null && <span>{t('episode_remission_before', { days: tn('days', episode.remissionBeforeDays) })}</span>}
      </div>

      {episode.residualSkin.length > 0 && (
        <div className="flex flex-wrap gap-1.5" data-testid="episode-skin">
          {episode.residualSkin.map((s) => (
            <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`skin_${s}`)}</span>
          ))}
        </div>
      )}
    </li>
  );
}

export function EpisodeList({ episodes }: { episodes: readonly Episode[] }) {
  const { t } = useLanguage();
  if (episodes.length === 0) return <p className="text-sm text-muted-foreground">{t('episodes_empty')}</p>;
  return (
    <ol className="space-y-2" data-testid="episode-list">
      {[...episodes].reverse().map((e) => (
        <EpisodeCard key={e.index} episode={e} />
      ))}
    </ol>
  );
}

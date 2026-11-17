import { useMemo } from 'react';
import { BedDouble } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { DailyLog } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import { assumedDaysAgo, defaultBedding, logsWithDraft, withAssumedDaysAgo } from '@/lib/dailyLogDraft';
import { canOverrideBedding, deriveBeddingForDate } from '@/lib/derive/bedding';
import { FieldLabel, NumberField, Section } from '../fields';
import type { SectionProps } from '../types';

/**
 * The day counter is DERIVED from every wash on record (plus this draft), never typed. The only
 * thing the user may enter is "last washed N days ago" while no wash exists yet.
 */
export function BeddingSection({ log, update, storedLogs }: SectionProps & { storedLogs: readonly DailyLog[] }) {
  const { t, tn, formatDate } = useLanguage();
  const history = useMemo(() => logsWithDraft(storedLogs, log), [storedLogs, log]);
  const info = useMemo(() => deriveBeddingForDate(history, log.date), [history, log.date]);
  const washed = log.bedding?.washedToday === true;
  const showOverride = !washed && canOverrideBedding(history, log.date);

  return (
    <Section title={t('sec_bedding')} filled={log.bedding !== null} onClear={() => update((l) => ({ ...l, bedding: null }))}>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>{t('bedding_washed_today')}</span>
        <Switch
          data-testid="bedding-washed"
          checked={washed}
          onCheckedChange={(c) => update((l) => ({ ...l, bedding: c ? { washedToday: true, assumedLastWashDate: null } : { ...(l.bedding ?? defaultBedding()), washedToday: false } }))}
        />
      </label>

      <div className="flex items-center gap-3 rounded-lg bg-muted px-3 py-3" aria-live="polite">
        <BedDouble className="size-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-xs text-muted-foreground">{t('bedding_days_since')}</p>
          {info.daysSinceWash === null ? (
            <p data-testid="bedding-days" data-days="" className="text-sm">{t('bedding_unknown')}</p>
          ) : (
            <>
              <p data-testid="bedding-days" data-days={info.daysSinceWash} className="text-lg font-semibold tabular-nums">
                {tn('days', info.daysSinceWash)}
              </p>
              {info.lastResetDate && (
                <p className="text-xs text-muted-foreground">
                  {t(info.source === 'assumed' ? 'bedding_source_assumed' : 'bedding_source_logged', { date: formatDate(info.lastResetDate, 'fmt_short_date') })}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {showOverride && (
        <div>
          <FieldLabel htmlFor="bedding-override" hint={t('bedding_override_hint')}>
            {t('bedding_override_label')}
          </FieldLabel>
          <NumberField id="bedding-override" min={0} max={365} step={1} value={assumedDaysAgo(log)} onChange={(v) => update((l) => withAssumedDaysAgo(l, v))} />
        </div>
      )}
    </Section>
  );
}

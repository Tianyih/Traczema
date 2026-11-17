import { CLEANSING_LEVELS, WATER_TEMPS, type CleansingLevel, type WaterTemp } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import { defaultShower } from '@/lib/dailyLogDraft';
import { Switch } from '@/components/ui/switch';
import { FieldLabel, NumberField, Section, Segmented } from '../fields';
import type { SectionProps } from '../types';

type ShowerState = 'unknown' | 'none' | 'took';

export function ShowerSection({ log, update }: SectionProps) {
  const { t } = useLanguage();
  const sh = log.shower;
  const state: ShowerState = sh === null ? 'unknown' : sh.took ? 'took' : 'none';
  const patch = (p: Partial<NonNullable<typeof sh>>) => update((l) => ({ ...l, shower: { ...(l.shower ?? defaultShower(true)), ...p } }));

  return (
    <Section title={t('sec_shower')} filled={sh !== null} onClear={() => update((l) => ({ ...l, shower: null }))}>
      <Segmented<ShowerState>
        testId="shower-state"
        ariaLabel={t('sec_shower')}
        value={state}
        onChange={(v) => update((l) => ({ ...l, shower: v === 'took' ? { ...(l.shower ?? defaultShower(true)), took: true } : v === 'none' ? defaultShower(false) : null }))}
        options={[
          { value: 'unknown', label: t('shower_state_unknown') },
          { value: 'none', label: t('shower_state_none') },
          { value: 'took', label: t('shower_state_took') },
        ]}
      />
      {sh?.took && (
        <>
          <div>
            <FieldLabel htmlFor="shower-duration">{t('shower_duration')}</FieldLabel>
            <NumberField id="shower-duration" min={0} max={240} step={1} value={sh.durationMin} onChange={(v) => patch({ durationMin: v })} />
          </div>
          <div>
            <FieldLabel>{t('shower_temp')}</FieldLabel>
            <Segmented<WaterTemp>
              testId="shower-temp"
              ariaLabel={t('shower_temp')}
              allowDeselect
              value={sh.waterTemp}
              onChange={(v) => patch({ waterTemp: v })}
              options={WATER_TEMPS.map((w) => ({ value: w, label: t(`watertemp_${w}`) }))}
            />
          </div>
          <div>
            <FieldLabel>{t('shower_cleansing')}</FieldLabel>
            <Segmented<CleansingLevel>
              testId="shower-cleansing"
              ariaLabel={t('shower_cleansing')}
              allowDeselect
              value={sh.cleansing}
              onChange={(v) => patch({ cleansing: v })}
              options={CLEANSING_LEVELS.map((c) => ({ value: c, label: t(`cleansing_${c}`) }))}
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>{t('shower_moisturizer')}</span>
            <Switch data-testid="shower-moisturizer" checked={sh.moisturizedWithin3Min === true} onCheckedChange={(c) => patch({ moisturizedWithin3Min: c })} />
          </label>
        </>
      )}
    </Section>
  );
}

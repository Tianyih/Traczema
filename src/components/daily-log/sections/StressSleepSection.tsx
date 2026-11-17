import { useLanguage } from '@/i18n/LanguageContext';
import { defaultSleep } from '@/lib/dailyLogDraft';
import { FieldLabel, NumberField, Section, Segmented, SliderField } from '../fields';
import type { SectionProps } from '../types';

const QUALITY = ['1', '2', '3', '4', '5'] as const;

export function StressSleepSection({ log, update }: SectionProps) {
  const { t } = useLanguage();
  const sleep = log.sleep;
  const patch = (p: Partial<NonNullable<typeof sleep>>) => update((l) => ({ ...l, sleep: { ...(l.sleep ?? defaultSleep()), ...p } }));
  return (
    <Section
      title={t('sec_stress_sleep')}
      filled={log.stressLevel !== null || sleep !== null}
      onClear={() => update((l) => ({ ...l, stressLevel: null, sleep: null }))}
    >
      <SliderField testId="stress" label={t('stress_level')} min={1} max={10} value={log.stressLevel} onChange={(v) => update((l) => ({ ...l, stressLevel: v }))} />
      <div>
        <FieldLabel htmlFor="sleep-hours">{t('sleep_hours')}</FieldLabel>
        <NumberField id="sleep-hours" min={0} max={24} step={0.5} value={sleep?.hours ?? null} onChange={(v) => patch({ hours: v })} />
      </div>
      <div>
        <FieldLabel hint={t('sleep_quality_scale')}>{t('sleep_quality')}</FieldLabel>
        <Segmented<(typeof QUALITY)[number]>
          testId="sleep-quality"
          ariaLabel={t('sleep_quality')}
          allowDeselect
          value={sleep?.quality == null ? null : (String(sleep.quality) as (typeof QUALITY)[number])}
          onChange={(v) => patch({ quality: v === null ? null : Number(v) })}
          options={QUALITY.map((q) => ({ value: q, label: q }))}
        />
      </div>
    </Section>
  );
}

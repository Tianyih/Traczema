import { useLanguage } from '@/i18n/LanguageContext';
import { Section, SliderField } from '../fields';
import type { SectionProps } from '../types';

export function SeveritySection({ log, update }: SectionProps) {
  const { t } = useLanguage();
  return (
    <Section title={t('sec_severity')} filled={log.overallSeverity !== null || log.itchIntensity !== null} onClear={() => update((l) => ({ ...l, overallSeverity: null, itchIntensity: null }))}>
      <SliderField testId="severity" heat label={t('sev_overall')} min={0} max={10} value={log.overallSeverity} onChange={(v) => update((l) => ({ ...l, overallSeverity: v }))} />
      <SliderField testId="itch" label={t('sev_itch')} min={0} max={10} value={log.itchIntensity} onChange={(v) => update((l) => ({ ...l, itchIntensity: v }))} />
    </Section>
  );
}

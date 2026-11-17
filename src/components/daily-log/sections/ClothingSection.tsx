import { CLOTHING_TAGS } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import { toggleIn } from '@/lib/dailyLogDraft';
import { Chip, Section } from '../fields';
import type { SectionProps } from '../types';

export function ClothingSection({ log, update }: SectionProps) {
  const { t } = useLanguage();
  const selected = log.clothing ?? [];
  return (
    <Section title={t('sec_clothing')} filled={log.clothing !== null} onClear={() => update((l) => ({ ...l, clothing: null }))}>
      <p className="-mt-2 text-xs text-muted-foreground">{t('clothing_hint')}</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('sec_clothing')}>
        {CLOTHING_TAGS.map((tag) => (
          <Chip key={tag} testId={`clothing-${tag}`} selected={selected.includes(tag)} onClick={() => update((l) => ({ ...l, clothing: toggleIn(selected, tag) }))}>
            {t(`clothing_${tag}`)}
          </Chip>
        ))}
      </div>
    </Section>
  );
}

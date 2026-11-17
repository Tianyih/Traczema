import { PRESET_DIET_TAGS, type DietTagRef } from '@/db/types';
import { useTags } from '@/hooks/useTags';
import { useLanguage } from '@/i18n/LanguageContext';
import { toggleIn } from '@/lib/dailyLogDraft';
import { Chip, CustomTagAdder, FieldLabel, Section } from '../fields';
import type { SectionProps } from '../types';

export function DietSection({ log, update }: SectionProps) {
  const { t } = useLanguage();
  const custom = useTags('diet');
  const selected = log.dietTags ?? [];
  const set = (tags: DietTagRef[] | null) => update((l) => ({ ...l, dietTags: tags }));
  const toggle = (tag: DietTagRef) => set(toggleIn(selected, tag));

  return (
    <Section title={t('sec_diet')} filled={log.dietTags !== null} onClear={() => set(null)}>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('sec_diet')}>
        {PRESET_DIET_TAGS.map((tag) => (
          <Chip key={tag} testId={`diet-${tag}`} selected={selected.includes(tag)} onClick={() => toggle(tag)}>
            {t(`diet_${tag}`)}
          </Chip>
        ))}
        {custom.tags.map((tag) => {
          const ref = `custom:${tag.id}` as const;
          return (
            <Chip key={tag.id} testId={`diet-${ref}`} selected={selected.includes(ref)} onClick={() => toggle(ref)}>
              {tag.label}
            </Chip>
          );
        })}
      </div>
      <Chip testId="diet-none" selected={log.dietTags !== null && log.dietTags.length === 0} onClick={() => set(log.dietTags !== null && log.dietTags.length === 0 ? null : [])}>
        {t('diet_none_today')}
      </Chip>
      <div>
        <FieldLabel>{t('diet_custom_label')}</FieldLabel>
        <CustomTagAdder
          testId="diet-custom-input"
          label={t('diet_custom_label')}
          placeholder={t('diet_custom_placeholder')}
          onAdd={async (label) => {
            const ref = await custom.add(label);
            set(selected.includes(ref) ? selected : [...selected, ref]);
          }}
        />
      </div>
    </Section>
  );
}

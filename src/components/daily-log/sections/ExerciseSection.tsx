import { ACTIVITIES, SWEAT_LEVELS, type ActivityRef, type SweatLevel } from '@/db/types';
import { useTags } from '@/hooks/useTags';
import { useLanguage } from '@/i18n/LanguageContext';
import { defaultExercise } from '@/lib/dailyLogDraft';
import { CustomTagAdder, FieldLabel, NumberField, Section, Segmented } from '../fields';
import type { SectionProps } from '../types';

export function ExerciseSection({ log, update }: SectionProps) {
  const { t } = useLanguage();
  const custom = useTags('activity');
  const ex = log.exercise;
  const patch = (p: Partial<NonNullable<typeof ex>>) => update((l) => ({ ...l, exercise: { ...(l.exercise ?? defaultExercise()), ...p } }));

  return (
    <Section title={t('sec_exercise')} filled={ex !== null} onClear={() => update((l) => ({ ...l, exercise: null }))}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="exercise-duration">{t('exercise_duration')}</FieldLabel>
          <NumberField id="exercise-duration" min={0} max={1440} step={5} value={ex?.durationMin ?? null} onChange={(v) => patch({ durationMin: v })} />
        </div>
        <div>
          <FieldLabel htmlFor="exercise-activity">{t('exercise_activity')}</FieldLabel>
          <select
            id="exercise-activity"
            data-testid="exercise-activity"
            value={ex?.activity ?? ''}
            onChange={(e) => patch({ activity: (e.target.value || null) as ActivityRef | null })}
            className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            <option value="">{t('exercise_activity_choose')}</option>
            {ACTIVITIES.map((a) => (
              <option key={a} value={a}>
                {t(`activity_${a}`)}
              </option>
            ))}
            {custom.tags.map((tag) => (
              <option key={tag.id} value={`custom:${tag.id}`}>
                {tag.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <CustomTagAdder
        label={t('exercise_custom_placeholder')}
        placeholder={t('exercise_custom_placeholder')}
        onAdd={async (label) => patch({ activity: await custom.add(label) })}
      />
      <div>
        <FieldLabel>{t('exercise_sweat')}</FieldLabel>
        <Segmented<SweatLevel>
          testId="sweat"
          ariaLabel={t('exercise_sweat')}
          allowDeselect
          value={ex?.sweat ?? null}
          onChange={(v) => patch({ sweat: v })}
          options={SWEAT_LEVELS.map((s) => ({ value: s, label: t(`sweat_${s}`) }))}
        />
      </div>
    </Section>
  );
}

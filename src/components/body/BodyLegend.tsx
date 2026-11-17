import { LESION_STATUSES } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import { StatusChip } from './StatusChip';

export function BodyLegend() {
  const { t } = useLanguage();
  return (
    <div className="space-y-1.5" data-testid="body-legend">
      <ul className="flex flex-wrap gap-1.5">
        {LESION_STATUSES.map((s) => (
          <li key={s}><StatusChip status={s} /></li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">{t('body_legend_hint')}</p>
    </div>
  );
}

import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BodyPartLog } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import type { ISODate } from '@/lib/date';
import { StatusChip } from './StatusChip';

export function ObservationHistory({ logs, onEdit }: { logs: readonly BodyPartLog[]; onEdit: (date: ISODate) => void }) {
  const { t, formatDate } = useLanguage();
  if (logs.length === 0) return <p className="text-sm text-muted-foreground">{t('history_empty')}</p>;
  return (
    <ul className="divide-y rounded-lg border bg-card" data-testid="history-list">
      {[...logs].reverse().map((l) => (
        <li key={l.id} data-testid="history-row" data-date={l.date} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
          <span className="w-28 tabular-nums">{formatDate(l.date, 'fmt_date_year')}</span>
          <StatusChip status={l.status} />
          {(l.status === 'active' || l.status === 'healing') && <span className="text-xs text-muted-foreground">{t('history_severity', { n: l.severity })}</span>}
          {l.residualSkin.map((s) => (
            <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`skin_${s}`)}</span>
          ))}
          {l.notes && <span className="min-w-0 flex-1 basis-full truncate text-xs text-muted-foreground sm:basis-0">{l.notes}</span>}
          <Button variant="ghost" size="sm" className="ml-auto" data-testid="history-edit" onClick={() => onEdit(l.date)}>
            <Pencil /> {t('history_edit')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

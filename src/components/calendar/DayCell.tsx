import { forwardRef } from 'react';
import { BedDouble, Camera, Flame } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { HEAT_INK, severityColor } from '@/lib/heat';
import type { ISODate } from '@/lib/date';
import type { DayFrame } from '@/lib/derive/frames';
import { cn } from '@/lib/utils';

export interface DayCellProps {
  date: ISODate;
  frame: DayFrame | undefined;
  isToday: boolean;
  isFuture: boolean;
  /** Month view: days outside the shown month are dimmed. */
  dimmed: boolean;
  tall: boolean;
  tabIndex: 0 | -1;
  onOpen: (date: ISODate) => void;
}

const Badge = ({ children, label, testId }: { children: React.ReactNode; label: string; testId: string }) => (
  <span data-testid={testId} title={label} className="inline-flex items-center gap-0.5 rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-neutral-900 sm:text-[11px]">
    {children}
  </span>
);

export const DayCell = forwardRef<HTMLButtonElement, DayCellProps>(function DayCell({ date, frame, isToday, isFuture, dimmed, tall, tabIndex, onOpen }, ref) {
  const { t, tn, formatDate } = useLanguage();
  const severity = frame?.severity ?? null;
  const photos = frame?.photoCount ?? 0;
  const flares = frame?.activeRegionCount ?? 0;
  const washed = frame?.beddingWashedToday === true;
  const hasBadges = photos > 0 || flares > 0 || washed;

  const parts = [formatDate(date, 'fmt_full_date')];
  parts.push(severity === null ? (isFuture ? t('cal_future_day') : t('cal_no_entry')) : t('cal_severity_value', { n: severity }));
  if (photos > 0) parts.push(tn('cal_photos', photos));
  if (flares > 0) parts.push(tn('cal_flares', flares));
  if (washed) parts.push(t('cal_bedding_washed'));

  return (
    <button
      ref={ref}
      type="button"
      role="gridcell"
      data-date={date}
      data-severity={severity ?? ''}
      data-testid="day-cell"
      tabIndex={tabIndex}
      aria-label={parts.join('. ')}
      aria-disabled={isFuture || undefined}
      aria-current={isToday ? 'date' : undefined}
      onClick={() => !isFuture && onOpen(date)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !isFuture) {
          e.preventDefault();
          onOpen(date);
        }
      }}
      style={severity !== null ? { background: severityColor(severity), color: HEAT_INK } : undefined}
      className={cn(
        'relative flex flex-col justify-between rounded-lg border p-1.5 text-left transition-shadow sm:p-2',
        tall ? 'min-h-36' : 'min-h-[4.25rem] sm:min-h-24',
        severity === null && 'bg-card',
        isFuture ? 'cursor-not-allowed opacity-40' : 'hover:shadow-md',
        dimmed && !isFuture && 'opacity-55',
        isToday && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
      )}
    >
      <span className={cn('text-xs font-medium tabular-nums sm:text-sm', severity === null && 'text-muted-foreground')}>{Number(date.slice(8))}</span>
      {severity !== null && (
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums sm:text-2xl">{severity}</span>
          {tall && frame?.itch != null && <span className="text-[11px] font-medium opacity-80">{t('cal_itch_value', { n: frame.itch })}</span>}
        </span>
      )}
      {hasBadges && (
        <span className="flex flex-wrap gap-0.5">
          {photos > 0 && (
            <Badge testId="badge-photos" label={tn('cal_photos', photos)}>
              <Camera className="size-3" aria-hidden /> {photos}
            </Badge>
          )}
          {flares > 0 && (
            <Badge testId="badge-flare" label={tn('cal_flares', flares)}>
              <Flame className="size-3 text-red-700" aria-hidden /> {flares}
            </Badge>
          )}
          {washed && (
            <Badge testId="badge-bedding" label={t('cal_bedding_washed')}>
              <BedDouble className="size-3 text-sky-800" aria-hidden />
            </Badge>
          )}
        </span>
      )}
    </button>
  );
});

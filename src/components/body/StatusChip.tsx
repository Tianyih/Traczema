import type { LesionStatus } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { statusDotStyle } from './statusStyles';

/** Status as colour swatch + words (never colour alone). */
export function StatusChip({ status, className, testId }: { status: LesionStatus; className?: string; testId?: string }) {
  const { t } = useLanguage();
  return (
    <span data-testid={testId} data-status={status} className={cn('inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium', className)}>
      <span aria-hidden className="size-2.5 rounded-full border border-black/20" style={statusDotStyle(status)} />
      {t(`status_${status}`)}
    </span>
  );
}

import { BadgeCheck, CircleDashed, CircleSlash, CircleDot } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { Evidence } from '@/lib/analytics/types';
import { cn } from '@/lib/utils';

const ICON = { strong: BadgeCheck, moderate: CircleDot, weak: CircleDashed, insufficient: CircleSlash } as const;

/** Evidence level as icon + words with weight differences: never colour alone, and not a status colour. */
export function EvidenceBadge({ evidence, testId }: { evidence: Evidence; testId?: string }) {
  const { t } = useLanguage();
  const Icon = ICON[evidence];
  return (
    <span
      data-testid={testId}
      data-evidence={evidence}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        evidence === 'strong' && 'border-[var(--viz-ink)] bg-[var(--viz-ink)] font-semibold text-[var(--viz-surface)]',
        evidence === 'moderate' && 'border-[var(--viz-ink)] font-medium text-[var(--viz-ink)]',
        evidence === 'weak' && 'text-[var(--viz-ink-2)]',
        evidence === 'insufficient' && 'text-[var(--viz-muted)] italic',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {t(`evidence_${evidence}`)}
    </span>
  );
}

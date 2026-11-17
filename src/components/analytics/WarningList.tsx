import { TriangleAlert } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import type { AnalysisWarning } from '@/lib/analytics/types';

/** Engine warnings are structured codes; the words are composed here. */
export function WarningList({ warnings }: { warnings: readonly AnalysisWarning[] }) {
  const { t } = useLanguage();
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-1.5" data-testid="analysis-warnings">
      {warnings.map((w) => (
        <li key={w.code} data-code={w.code} className="flex items-start gap-2 rounded-md bg-warning px-3 py-2 text-xs text-warning-foreground">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {w.code === 'no_data' && t('warn_no_data')}
          {w.code === 'small_sample' && t('warn_small_sample', w.params)}
          {w.code === 'few_tier_days' && t('warn_few_tier_days', w.params)}
          {w.code === 'low_coverage' && t('warn_low_coverage', w.params)}
        </li>
      ))}
    </ul>
  );
}

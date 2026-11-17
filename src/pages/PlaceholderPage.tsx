import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';

export function PlaceholderPage({ titleKey }: { titleKey: MessageKey }) {
  const { t } = useLanguage();
  return (
    <section className="rounded-xl border bg-card p-8 text-center" data-testid="placeholder-page">
      <h2 className="text-xl font-semibold">{t(titleKey)}</h2>
      <p className="mt-2 text-muted-foreground">{t('coming_soon_body')}</p>
    </section>
  );
}

import { useLanguage } from '@/i18n/LanguageContext';

/** Phase 1 placeholder. The real shell, header toggle and routes arrive in Phase 2. */
export function App() {
  const { t } = useLanguage();
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">{t('app_title')}</h1>
      <p className="mt-2 text-neutral-600">{t('phase1_placeholder')}</p>
    </main>
  );
}

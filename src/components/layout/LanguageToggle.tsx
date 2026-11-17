import { Languages } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';

/** Persistent `EN / 中文` switch. The choice is stored in localStorage by the provider. */
export function LanguageToggle() {
  const { lang, toggleLang, t } = useLanguage();
  return (
    <button
      type="button"
      data-testid="lang-toggle"
      aria-label={t('lang_switch_aria')}
      onClick={toggleLang}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-2.5 text-sm hover:bg-muted"
    >
      <Languages className="size-4 text-muted-foreground" aria-hidden />
      <span className={cn(lang === 'en' ? 'font-semibold text-primary' : 'text-muted-foreground')}>EN</span>
      <span className="text-muted-foreground" aria-hidden>/</span>
      <span lang="zh-CN" className={cn(lang === 'zh' ? 'font-semibold text-primary' : 'text-muted-foreground')}>中文</span>
    </button>
  );
}

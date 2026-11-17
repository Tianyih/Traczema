import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { zhCN } from 'date-fns/locale/zh-CN';
import { formatISO, type ISODate } from '@/lib/date';
import {
  LANG_STORAGE_KEY,
  createTranslator,
  resolveInitialLang,
  type Lang,
  type MessageKey,
  type Translator,
} from './index';

/** date-fns locales kept in lock-step with the active language. */
export const DATE_LOCALES: Record<Lang, Locale> = { en: enUS, zh: zhCN };

/** Keys of the date format strings in the message files. */
export type DateFormatKey = Extract<MessageKey, `fmt_${string}`>;

export interface LanguageContextValue extends Translator {
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  dateLocale: Locale;
  /** 0 = Sunday, 1 = Monday — taken from the active date-fns locale. */
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  formatDate: (date: ISODate, format: DateFormatKey) => string;
  formatNumber: (n: number, options?: Intl.NumberFormatOptions) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function readStoredLang(): string | null {
  try {
    return localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null; // storage can be blocked (private mode, etc.)
  }
}

export function LanguageProvider({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) {
  // Persisted in localStorage (not Dexie) so the choice is shared by the real and demo databases.
  const [lang, setLangState] = useState<Lang>(
    () => initialLang ?? resolveInitialLang(readStoredLang(), typeof navigator === 'undefined' ? undefined : navigator.language),
  );

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* the in-memory choice still applies for this session */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }, [lang]);

  const value = useMemo<LanguageContextValue>(() => {
    const translator = createTranslator(lang);
    const dateLocale = DATE_LOCALES[lang];
    const intlLocale = lang === 'zh' ? 'zh-CN' : 'en';
    return {
      ...translator,
      setLang,
      toggleLang: () => setLang(lang === 'en' ? 'zh' : 'en'),
      dateLocale,
      weekStartsOn: dateLocale.options?.weekStartsOn ?? 0,
      formatDate: (date, format) => formatISO(date, translator.t(format), dateLocale),
      formatNumber: (n, options) => new Intl.NumberFormat(intlLocale, options).format(n),
    };
  }, [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside <LanguageProvider>');
  return ctx;
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { useDb } from './useDb';

/** Load / clear demo data, with a short-lived status message for the UI. */
export function useDemoActions() {
  const { seedDemo, clearDemo } = useDb();
  const { t, has } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = (text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 4000);
  };

  const load = useCallback(async () => {
    setBusy(true);
    try {
      // Notes and photo captions are resolved ONCE here, in the language active right now.
      const res = await seedDemo((key) => (has(key) ? t(key) : key));
      flash(t('demo_loaded', { n: res.dailyLogs }));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedDemo, t, has]);

  const clear = useCallback(async () => {
    setBusy(true);
    try {
      await clearDemo();
      flash(t('demo_cleared'));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearDemo, t]);

  return { load, clear, busy, message };
}

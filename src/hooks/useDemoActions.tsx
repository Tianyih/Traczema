import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '@/i18n/LanguageContext';
import { useDb } from './useDb';

interface DemoActions {
  load: () => Promise<void>;
  clear: () => Promise<void>;
  busy: boolean;
  /** Short-lived confirmation text, shown by <DemoToast />. */
  message: string | null;
}

const DemoActionsContext = createContext<DemoActions | null>(null);

/**
 * Load / clear demo data, with ONE shared busy flag and status message for the whole app. (Keeping this
 * per component meant a load started from an empty-state button showed no confirmation, because only
 * the Settings menu's own copy of the state was rendered.)
 */
export function DemoActionsProvider({ children }: { children: ReactNode }) {
  const { seedDemo, clearDemo } = useDb();
  const { t, has } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flash = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      // Notes and photo captions are resolved ONCE here, in the language active right now.
      const res = await seedDemo((key) => (has(key) ? t(key) : key));
      flash(t('demo_loaded', { n: res.dailyLogs }));
    } finally {
      setBusy(false);
    }
  }, [seedDemo, t, has, flash]);

  const clear = useCallback(async () => {
    setBusy(true);
    try {
      await clearDemo();
      flash(t('demo_cleared'));
    } finally {
      setBusy(false);
    }
  }, [clearDemo, t, flash]);

  const value = useMemo(() => ({ load, clear, busy, message }), [load, clear, busy, message]);
  return <DemoActionsContext.Provider value={value}>{children}</DemoActionsContext.Provider>;
}

export function useDemoActions(): DemoActions {
  const ctx = useContext(DemoActionsContext);
  if (!ctx) throw new Error('useDemoActions must be used inside <DemoActionsProvider>');
  return ctx;
}

/**
 * Portalled to <body>: the header uses backdrop-filter, which would otherwise become the containing
 * block of this `fixed` toast and pin it inside the header instead of the viewport.
 */
export function DemoToast() {
  const { message } = useDemoActions();
  const { mode } = useDb();
  if (!message) return null;
  return createPortal(
    <p role="status" data-testid="demo-message" data-mode={mode} className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">
      {message}
    </p>,
    document.body,
  );
}

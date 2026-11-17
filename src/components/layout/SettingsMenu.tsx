import { createPortal } from 'react-dom';
import { DatabaseZap, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useDemoActions } from '@/hooks/useDemoActions';
import { useDb } from '@/hooks/useDb';
import { useLanguage } from '@/i18n/LanguageContext';

/** Settings menu: load / clear the 60-day demo dataset (kept in a separate database). */
export function SettingsMenu() {
  const { t } = useLanguage();
  const { mode } = useDb();
  const { load, clear, busy, message } = useDemoActions();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="size-9" aria-label={t('menu_settings')} data-testid="settings-trigger">
            <Settings />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="settings-menu">
          <DropdownMenuLabel className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground">{t('menu_settings')}</DropdownMenuLabel>
          <DropdownMenuItem disabled={busy} data-testid="demo-load" onSelect={() => void load()}>
            <DatabaseZap className="size-4" /> {busy ? t('demo_loading') : t('demo_load')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={busy} data-testid="demo-clear" onSelect={() => void clear()}>
            <Trash2 className="size-4" /> {t('demo_clear')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <p className="max-w-64 px-2.5 py-2 text-xs text-muted-foreground">{t('demo_hint')}</p>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Portalled to <body>: the header uses backdrop-filter, which would otherwise become the containing
          block of this `fixed` toast and pin it inside the header instead of the viewport. */}
      {message &&
        createPortal(
          <p role="status" data-testid="demo-message" className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg" data-mode={mode}>
            {message}
          </p>,
          document.body,
        )}
    </>
  );
}

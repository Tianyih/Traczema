import { NavLink, Outlet } from 'react-router-dom';
import { Activity, CalendarDays, PersonStanding } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DemoToast } from '@/hooks/useDemoActions';
import { useDb } from '@/hooks/useDb';
import { useLanguage } from '@/i18n/LanguageContext';
import { cn } from '@/lib/utils';
import { LanguageToggle } from './LanguageToggle';
import { SettingsMenu } from './SettingsMenu';

const NAV = [
  { to: '/', key: 'nav_calendar', icon: CalendarDays, end: true },
  { to: '/body', key: 'nav_body', icon: PersonStanding, end: false },
  { to: '/analytics', key: 'nav_analytics', icon: Activity, end: false },
] as const;

export function AppShell() {
  const { t } = useLanguage();
  const { mode, setMode } = useDb();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2.5">
          <h1 className="text-lg font-semibold tracking-tight">{t('app_title')}</h1>
          <nav aria-label="Primary" className="order-3 flex w-full gap-1 sm:order-none sm:w-auto">
            {NAV.map(({ to, key, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                data-testid={`nav-${key}`}
                className={({ isActive }) =>
                  cn('inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium sm:flex-none', isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted')
                }
              >
                <Icon className="size-4" aria-hidden /> {t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle />
            <SettingsMenu />
          </div>
        </div>
        {mode === 'demo' && (
          <div data-testid="demo-banner" className="border-t bg-warning text-warning-foreground">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-sm">
              <span>{t('demo_banner')}</span>
              <Button size="sm" variant="outline" className="bg-card/70" data-testid="demo-exit" onClick={() => setMode('real')}>
                {t('demo_exit')}
              </Button>
            </div>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">
        <Outlet />
      </main>
      <DemoToast />
    </div>
  );
}

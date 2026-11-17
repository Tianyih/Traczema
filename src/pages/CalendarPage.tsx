import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, DatabaseZap } from 'lucide-react';
import { CalendarView } from '@/components/calendar/CalendarView';
import { SeverityLegend } from '@/components/calendar/SeverityLegend';
import { Button } from '@/components/ui/button';
import { useStoredData, useFrames } from '@/hooks/useCalendarData';
import { useDemoActions } from '@/hooks/useDemoActions';
import { useDb } from '@/hooks/useDb';
import { useLanguage } from '@/i18n/LanguageContext';
import { buildGrid, dataRange, shiftAnchor, type CalendarView as View } from '@/lib/calendar';
import { isISODate, todayISO, type ISODate } from '@/lib/date';
import { cn } from '@/lib/utils';

// The drawer carries most of the form / Radix code, so it loads on first open, not on first paint.
const DailyLogDrawer = lazy(() => import('@/components/daily-log/DailyLogDrawer').then((m) => ({ default: m.DailyLogDrawer })));

const VIEW_KEY = 'traczema.calendarView';
const readView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'week' ? 'week' : 'month';
  } catch {
    return 'month';
  }
};

export function CalendarPage() {
  const { t, weekStartsOn, formatDate } = useLanguage();
  const { mode } = useDb();
  const { load, busy } = useDemoActions();
  const [params, setParams] = useSearchParams();

  const today = todayISO();
  const [view, setViewState] = useState<View>(readView);
  const [anchor, setAnchor] = useState<ISODate>(today);
  const [focusDate, setFocusDate] = useState<ISODate>(today);
  const [focusSignal, setFocusSignal] = useState(0);

  const grid = useMemo(() => buildGrid(anchor, view, weekStartsOn), [anchor, view, weekStartsOn]);
  const data = useStoredData();
  const range = dataRange(grid, today);
  const frames = useFrames(data, range.from, range.to);

  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* session-only */
    }
  };

  // Keyboard focus that leaves the visible grid scrolls the calendar with it.
  useEffect(() => {
    if (focusDate < grid.from || focusDate > grid.to) setAnchor(focusDate);
  }, [focusDate, grid.from, grid.to]);

  const dateParam = params.get('date');
  const drawerDate: ISODate | null = isISODate(dateParam) && dateParam <= today ? dateParam : null;

  const openDay = (date: ISODate) => {
    setFocusDate(date);
    setParams({ date }, { replace: false });
  };
  const closeDrawer = () => setParams({}, { replace: true });

  // Hand focus back to the day cell once the drawer is actually gone. (Doing it inside closeDrawer
  // is too early: the router applies the URL change later, so the modal would still trap focus.)
  // This also covers the browser Back button closing the drawer.
  const drawerWasOpen = useRef(false);
  useEffect(() => {
    if (drawerWasOpen.current && drawerDate === null) setFocusSignal((n) => n + 1);
    drawerWasOpen.current = drawerDate !== null;
  }, [drawerDate]);

  const go = (dir: -1 | 1) => {
    const next = shiftAnchor(anchor, view, dir);
    setAnchor(next);
    setFocusDate(next);
  };

  const label = view === 'month' ? formatDate(anchor, 'fmt_month_year') : `${formatDate(grid.from, 'fmt_short_date')} – ${formatDate(grid.to, 'fmt_short_date')}`;
  const isEmpty = data !== undefined && data.dailyLogs.length === 0 && data.bodyPartLogs.length === 0 && data.photoCounts.size === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-40 text-xl font-semibold" data-testid="calendar-label" aria-live="polite">
          {label}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label={t('nav_calendar')} className="inline-flex rounded-lg bg-muted p-1">
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                type="button"
                data-testid={`view-${v}`}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={cn('h-8 rounded-md px-3 text-sm font-medium', view === v ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}
              >
                {t(v === 'month' ? 'cal_view_month' : 'cal_view_week')}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" data-testid="cal-today" onClick={() => { setAnchor(today); setFocusDate(today); }}>
            {t('cal_today')}
          </Button>
          <Button variant="outline" size="iconSm" aria-label={t('cal_prev')} data-testid="cal-prev" onClick={() => go(-1)}>
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="iconSm" aria-label={t('cal_next')} data-testid="cal-next" onClick={() => go(1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      {isEmpty && mode === 'real' && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-dashed bg-card p-4" data-testid="empty-state">
          <CalendarPlus className="size-8 text-muted-foreground" aria-hidden />
          <div className="min-w-48 flex-1">
            <p className="font-medium">{t('cal_empty_title')}</p>
            <p className="text-sm text-muted-foreground">{t('cal_empty_body')}</p>
          </div>
          <Button variant="outline" disabled={busy} onClick={() => void load()} data-testid="empty-load-demo">
            <DatabaseZap /> {t('demo_load')}
          </Button>
        </div>
      )}

      <CalendarView
        grid={grid}
        view={view}
        anchor={anchor}
        today={today}
        frames={frames}
        focusDate={focusDate}
        onFocusDate={setFocusDate}
        onOpen={openDay}
        focusSignal={focusSignal}
      />
      <SeverityLegend />

      {drawerDate && (
        <Suspense fallback={null}>
          <DailyLogDrawer date={drawerDate} today={today} onClose={closeDrawer} onNavigate={openDay} />
        </Suspense>
      )}
    </div>
  );
}

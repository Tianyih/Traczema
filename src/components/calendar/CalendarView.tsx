import { useEffect, useRef } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { addDaysISO, type ISODate } from '@/lib/date';
import type { CalendarGrid, CalendarView as View } from '@/lib/calendar';
import { isSameMonth, weekdayLabels } from '@/lib/calendar';
import type { DayFrame } from '@/lib/derive/frames';
import { DayCell } from './DayCell';

export interface CalendarViewProps {
  grid: CalendarGrid;
  view: View;
  anchor: ISODate;
  today: ISODate;
  frames: Map<ISODate, DayFrame>;
  focusDate: ISODate;
  /** Focus moved (keyboard). `scroll` = the target is outside the visible grid. */
  onFocusDate: (date: ISODate) => void;
  onOpen: (date: ISODate) => void;
  /** Bumped when focus should be moved into the grid (after the drawer closes). */
  focusSignal: number;
}

export function CalendarView({ grid, view, anchor, today, frames, focusDate, onFocusDate, onOpen, focusSignal }: CalendarViewProps) {
  const { t, dateLocale, weekStartsOn } = useLanguage();
  const root = useRef<HTMLDivElement>(null);
  const wantFocus = useRef(false);

  // Move DOM focus onto the focused cell after navigation / drawer close.
  useEffect(() => {
    if (!wantFocus.current && focusSignal === 0) return;
    wantFocus.current = false;
    root.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [focusDate, focusSignal, grid]);

  const move = (delta: number) => {
    wantFocus.current = true;
    onFocusDate(addDaysISO(focusDate, delta));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) {
      e.preventDefault();
      move(step[e.key] as number);
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      move(view === 'month' ? (e.key === 'PageUp' ? -28 : 28) : e.key === 'PageUp' ? -7 : 7);
    }
  };

  const weekdays = weekdayLabels(weekStartsOn, dateLocale, 'EEE');
  const flat = grid.weeks.flat();
  const focusIsVisible = flat.includes(focusDate);

  return (
    <div ref={root} role="grid" aria-label={t('cal_grid_aria')} onKeyDown={onKeyDown} data-testid="calendar-grid" data-view={view} className="space-y-1.5">
      <div role="row" className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {weekdays.map((w, i) => (
          <div key={i} role="columnheader" className="py-1 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
      </div>
      {grid.weeks.map((week, wi) => (
        <div key={wi} role="row" className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {week.map((date) => (
            <DayCell
              key={date}
              date={date}
              frame={frames.get(date)}
              isToday={date === today}
              isFuture={date > today}
              dimmed={view === 'month' && !isSameMonth(date, anchor)}
              tall={view === 'week'}
              // roving tabindex: exactly one cell is a tab stop (fall back to the first if focus is off-screen)
              tabIndex={date === focusDate || (!focusIsVisible && date === flat[0]) ? 0 : -1}
              onOpen={onOpen}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

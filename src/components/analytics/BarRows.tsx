import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Horizontal bar chart built from plain HTML (so labels wrap, hover/focus tooltips are real DOM, and the
 * rows are readable by assistive tech). Marks follow the chart spec: thin (<= 24px), 4px rounded data
 * end with a square baseline, one shared baseline, value printed at the tip.
 */
export interface BarDatum {
  key: string;
  label: ReactNode;
  /** null = no data (draws no bar). */
  value: number | null;
  /** Text printed at the bar tip. */
  valueText: string;
  /** Emphasis: the one highlighted series gets the accent, everything else the neutral. */
  accent: boolean;
  /** Optional marker (e.g. the median) on the same scale. */
  marker?: number | null;
  /** Rich hover / keyboard-focus readout. Values lead, labels follow. */
  tooltip: ReactNode;
  /** Plain-text equivalent for assistive tech. */
  ariaLabel: string;
  attrs?: Record<string, string | number | boolean | undefined>;
}

export interface BarRowsProps {
  rows: readonly BarDatum[];
  /** Value that maps to the full width of the track. */
  max: number;
  /** A reference value (baseline, 1x) drawn as a vertical line, with a label under the axis. */
  reference?: { at: number; label: string } | null;
  /** Tick values for the axis under the rows. */
  ticks: readonly { at: number; label: string }[];
  testId?: string;
  labelWidth?: string;
}

const pct = (v: number, max: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;

export function BarRows({ rows, max, reference, ticks, testId, labelWidth = '9.5rem' }: BarRowsProps) {
  const cols = `${labelWidth} minmax(0, 1fr)`;
  return (
    <div data-testid={testId} className="text-sm">
      <ul role="list" className="space-y-1">
        {rows.map((r) => (
          <li
            key={r.key}
            role="listitem"
            tabIndex={0}
            aria-label={r.ariaLabel}
            data-key={r.key}
            data-accent={r.accent}
            data-value={r.value ?? ''}
            {...Object.fromEntries(Object.entries(r.attrs ?? {}).map(([k, v]) => [`data-${k}`, v]))}
            className="group relative grid items-center gap-x-3 rounded-md py-0.5 outline-none focus-visible:bg-black/5 dark:focus-visible:bg-white/10"
            style={{ gridTemplateColumns: cols }}
          >
            <span className="break-words text-[13px] leading-tight text-[var(--viz-ink-2)]">{r.label}</span>
            {/* track: bars are scaled inside it, leaving room on the right for the value at the tip */}
            <span className="relative block h-6" aria-hidden="true">
              <span className="absolute inset-y-0 left-0 right-12">
                {r.value !== null && (
                  <span
                    className="absolute left-0 top-1/2 block h-4 -translate-y-1/2 rounded-r-[4px]"
                    style={{ width: pct(r.value, max), background: r.accent ? 'var(--viz-severity)' : 'var(--viz-neutral)', minWidth: r.value > 0 ? 2 : 0 }}
                  />
                )}
                {r.marker != null && (
                  <span
                    className="absolute top-1/2 block size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ left: pct(r.marker, max), background: 'var(--viz-ink)', boxShadow: '0 0 0 2px var(--viz-surface)' }}
                  />
                )}
                {reference && <span className="absolute inset-y-0 w-px bg-[var(--viz-ink-2)]" style={{ left: pct(reference.at, max) }} />}
              </span>
              <span className="absolute inset-y-0 right-0 flex w-11 items-center justify-end text-xs font-semibold tabular-nums text-[var(--viz-ink)]">{r.valueText}</span>
            </span>
            <div role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-30 hidden w-max max-w-[18rem] -translate-x-1/2 rounded-lg border bg-[var(--viz-surface)] px-3 py-2 text-xs shadow-lg group-hover:block group-focus-visible:block">
              {r.tooltip}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-1 grid" style={{ gridTemplateColumns: cols }} aria-hidden="true">
        <span />
        <span className="relative block h-5 border-t border-[var(--viz-axis)]">
          <span className="absolute inset-y-0 left-0 right-12">
            {ticks.map((t) => (
              <span key={t.at} className="absolute top-0.5 -translate-x-1/2 text-[11px] tabular-nums text-[var(--viz-muted)]" style={{ left: pct(t.at, max) }}>
                {t.label}
              </span>
            ))}
          </span>
        </span>
      </div>
      {reference && (
        <p className="mt-1 text-xs text-[var(--viz-ink-2)]" data-testid={testId ? `${testId}-reference` : undefined}>
          <span aria-hidden className="mr-1.5 inline-block h-3 w-px translate-y-0.5 bg-[var(--viz-ink-2)]" />
          {reference.label}
        </p>
      )}
    </div>
  );
}

/** Legend entry: a rect for bars, a dot for markers, a line key for reference lines. */
export function LegendKey({ kind, color, children }: { kind: 'bar' | 'dot' | 'line' | 'hline'; color: string; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 text-xs text-[var(--viz-ink-2)]">
      {kind === 'bar' && <span aria-hidden className="h-2.5 w-3.5 rounded-r-[3px]" style={{ background: color }} />}
      {kind === 'dot' && <span aria-hidden className="size-2.5 rounded-full" style={{ background: color, boxShadow: '0 0 0 2px var(--viz-surface)' }} />}
      {kind === 'line' && <span aria-hidden className="h-3 w-px" style={{ background: color }} />}
      {kind === 'hline' && <span aria-hidden className="h-px w-4" style={{ background: color }} />}
      {children}
    </li>
  );
}

/** A titled chart panel on the chart surface. */
export function VizCard({ title, subtitle, children, testId, className }: { title: string; subtitle?: ReactNode; children: ReactNode; testId?: string; className?: string }) {
  return (
    <section data-testid={testId} className={cn('viz-root rounded-xl border p-4', className)} aria-label={title}>
      <header className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <div className="mt-0.5 text-xs text-[var(--viz-ink-2)]">{subtitle}</div>}
      </header>
      {children}
    </section>
  );
}

/** Tooltip body: the value leads, the label follows. */
export function TipRow({ value, label, keyColor }: { value: ReactNode; label: ReactNode; keyColor?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      {keyColor && <span aria-hidden className="h-0.5 w-3 shrink-0 translate-y-[-2px] rounded" style={{ background: keyColor }} />}
      <strong className="tabular-nums text-[var(--viz-ink)]">{value}</strong>
      <span className="text-[var(--viz-ink-2)]">{label}</span>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { Check, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useLanguage } from '@/i18n/LanguageContext';
import { HEAT_INK, severityColor } from '@/lib/heat';
import { parseNumberInput } from '@/lib/dailyLogDraft';
import { cn } from '@/lib/utils';

/** A titled card. `filled` shows a Clear action; otherwise "Not recorded". */
export function Section({ title, filled, onClear, children, id }: { title: string; filled?: boolean; onClear?: () => void; children: ReactNode; id?: string }) {
  const { t } = useLanguage();
  return (
    <section id={id} className="rounded-xl border bg-card p-4" aria-label={title}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {onClear &&
          (filled ? (
            <Button variant="ghost" size="sm" onClick={onClear} className="-mr-2 text-muted-foreground">
              <X /> {t('log_clear_section')}
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">{t('log_not_recorded')}</span>
          ))}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function FieldLabel({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <div className="mb-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {children}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface SliderFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min: number;
  max: number;
  /** Tint the value chip with the severity heat colour. */
  heat?: boolean;
  testId?: string;
}

/** A slider that can honestly be "not rated" (null), distinct from 0. */
export function SliderField({ label, value, onChange, min, max, heat, testId }: SliderFieldProps) {
  const { t } = useLanguage();
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-1">
          <span
            data-testid={testId ? `${testId}-value` : undefined}
            className={cn('min-w-12 rounded-md px-2 py-0.5 text-center text-sm font-semibold tabular-nums', value === null && 'bg-muted text-xs font-normal text-muted-foreground')}
            style={heat && value !== null ? { background: severityColor(value), color: HEAT_INK } : undefined}
          >
            {value === null ? t('sev_not_rated') : value}
          </span>
          {value !== null && (
            <button type="button" onClick={() => onChange(null)} aria-label={`${label}: ${t('log_clear_section')}`} className="rounded p-1 text-muted-foreground hover:bg-muted">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <Slider
        aria-label={label}
        data-testid={testId}
        min={min}
        max={max}
        step={1}
        muted={value === null}
        value={[value ?? min]}
        onValueChange={([v]) => v !== undefined && onChange(v)}
        onValueCommit={([v]) => v !== undefined && onChange(v)}
        onKeyDown={(e) => {
          if (value === null && (e.key === 'Enter' || e.key === ' ' || e.key === 'Home')) {
            e.preventDefault();
            onChange(min);
          }
        }}
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export interface NumberFieldProps {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  placeholder?: string;
  className?: string;
}

/** Numeric input that lets you type "7." or "-" without the value being rewritten under you. */
export function NumberField({ id, value, onChange, min, max, step = 1, suffix, placeholder, className }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? '' : String(value));
  useEffect(() => {
    if (parseNumberInput(text) !== value) setText(value === null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseNumberInput(e.target.value));
        }}
        className={suffix ? 'pr-12' : undefined}
      />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{suffix}</span>}
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/** Single-choice segmented control. With `allowDeselect`, clicking the active option clears it. */
export function Segmented<T extends string>({
  value, onChange, options, ariaLabel, allowDeselect, testId,
}: {
  value: T | null;
  onChange: (v: T | null) => void;
  options: readonly SegmentedOption<T>[];
  ariaLabel: string;
  allowDeselect?: boolean;
  testId?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={ariaLabel}
      data-testid={testId}
      value={value ?? ''}
      onValueChange={(v) => {
        if (v) onChange(v as T);
        else if (allowDeselect) onChange(null);
      }}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-muted p-1"
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="min-h-9 rounded-md px-2 py-1.5 text-center text-xs font-medium leading-tight transition-colors hover:bg-card/60 data-[state=on]:bg-card data-[state=on]:text-primary data-[state=on]:shadow-sm sm:text-sm"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/** A toggle chip (multi-select building block). */
export function Chip({ selected, onClick, children, testId }: { selected: boolean; onClick: () => void; children: ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
        selected ? 'border-primary bg-accent text-accent-foreground' : 'bg-card hover:bg-muted',
      )}
    >
      {selected && <Check className="size-3.5" />}
      {children}
    </button>
  );
}

/** Text input + Add button for creating a custom tag. */
export function CustomTagAdder({ placeholder, onAdd, label, testId }: { placeholder: string; onAdd: (label: string) => void | Promise<void>; label: string; testId?: string }) {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const submit = async () => {
    const clean = text.trim();
    if (!clean) return;
    await onAdd(clean);
    setText('');
  };
  return (
    <div className="flex gap-2">
      <Input
        value={text}
        aria-label={label}
        data-testid={testId}
        placeholder={placeholder}
        maxLength={40}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <Button variant="outline" onClick={() => void submit()} disabled={text.trim() === ''}>
        <Plus /> {t('tag_add')}
      </Button>
    </div>
  );
}

export function Notice({ tone, children, testId }: { tone: 'info' | 'error' | 'success'; children: ReactNode; testId?: string }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      data-testid={testId}
      className={cn(
        'rounded-md px-3 py-2 text-xs',
        tone === 'error' && 'bg-destructive/10 text-destructive',
        tone === 'success' && 'bg-accent text-accent-foreground',
        tone === 'info' && 'bg-muted text-muted-foreground',
      )}
    >
      {children}
    </p>
  );
}

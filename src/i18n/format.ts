/**
 * UI-side composition of engine descriptors into display text. The engine only emits structured
 * values (ids, numbers, bounds, key names); this is where they become words.
 */
import type { CustomRef } from '@/db/types';
import type { FactorValue, Unit } from '@/lib/analytics/types';
import type { MessageKey, Translator } from './index';

export function formatRange(
  tr: Translator,
  min: number | null,
  max: number | null,
  unit: Unit,
  integer: boolean,
): string {
  const suffix = tr.t(`unit_${unit}`);
  let text: string;
  if (min === null && max === null) text = '';
  else if (min === null) text = tr.t('range_lt', { max: max as number });
  else if (max === null) text = integer ? tr.t('range_gt', { n: min - 1 }) : tr.t('range_gte', { min });
  else if (integer && max - 1 === min) text = tr.t('range_exact', { n: min });
  else text = tr.t('range_between', { min, max: integer ? max - 1 : max });
  return `${text}${suffix}`;
}

/** `customLabels` maps `custom:<id>` to the user's own text (never translated). */
export function formatFactorValue(
  tr: Translator,
  value: FactorValue,
  customLabels: ReadonlyMap<CustomRef, string> = new Map(),
): string {
  switch (value.kind) {
    case 'key':
      return tr.t(value.labelKey as MessageKey);
    case 'range':
      return formatRange(tr, value.min, value.max, value.unit, value.integer);
    case 'custom':
      return customLabels.get(value.ref) ?? value.ref;
  }
}

export function formatFactorLabel(
  tr: Translator,
  variableLabelKey: string,
  value: FactorValue,
  customLabels?: ReadonlyMap<CustomRef, string>,
): string {
  if (value.kind === 'key' && variableLabelKey === 'var_composite') return tr.t(value.labelKey as MessageKey);
  return tr.t('factor_label', {
    variable: tr.t(variableLabelKey as MessageKey),
    value: formatFactorValue(tr, value, customLabels),
  });
}

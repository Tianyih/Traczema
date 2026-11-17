/**
 * Data-driven registry of every trackable variable, its buckets/categories, and how to read it
 * from a DayFrame. Adding a variable here makes it available to the forward explorer, the reverse
 * scan and the trigger ranking with no engine changes.
 *
 * Buckets are half-open [min, max); `null` = unbounded. Labels are NOT stored here: the UI builds
 * range text from min/max/unit and looks up `labelKey`s with `t()`.
 */
import type { ActivityRef, CustomRef, DietTagRef } from '@/db/types';
import { ACTIVITIES, CLEANSING_LEVELS, CLOTHING_TAGS, PRESET_DIET_TAGS, SWEAT_LEVELS, WATER_TEMPS } from '@/db/types';
import type { DayFrame } from '@/lib/derive/frames';
import type { FactorDef, FactorValue, Unit, VariableGroup, VariableId } from './types';

export interface Bucket {
  id: string;
  min: number | null;
  max: number | null;
}

export interface Category {
  id: string;
  value: FactorValue;
}

interface Base {
  id: VariableId;
  labelKey: string;
  group: VariableGroup;
}

export interface ContinuousVariable extends Base {
  kind: 'continuous';
  unit: Unit;
  /** Integer-valued variables render "[4,8)" as "4–7". */
  integer: boolean;
  buckets: Bucket[];
  value: (f: DayFrame) => number | null;
}

export interface CategoricalVariable extends Base {
  kind: 'ordinal' | 'nominal' | 'boolean';
  /** Ordered low -> high for ordinal variables. */
  categories: Category[];
  category: (f: DayFrame) => string | null;
}

export interface MultiTagVariable extends Base {
  kind: 'multiTag';
  categories: Category[];
  tags: (f: DayFrame) => readonly string[] | null;
}

export type Variable = ContinuousVariable | CategoricalVariable | MultiTagVariable;

export interface RegistryContext {
  customDietTags?: readonly CustomRef[];
  customActivities?: readonly CustomRef[];
}

const key = (labelKey: string): FactorValue => ({ kind: 'key', labelKey });
const custom = (ref: CustomRef): FactorValue => ({ kind: 'custom', ref });

const B = (id: string, min: number | null, max: number | null): Bucket => ({ id, min, max });

export const BEDDING_BUCKETS: Bucket[] = [
  B('bedding_0_3', 0, 4),
  B('bedding_4_7', 4, 8),
  B('bedding_8_10', 8, 11),
  B('bedding_11_14', 11, 15),
  B('bedding_gt14', 15, null),
];

export function buildRegistry(ctx: RegistryContext = {}): Variable[] {
  const dietCats: Category[] = [
    ...PRESET_DIET_TAGS.map((t) => ({ id: t, value: key(`diet_${t}`) })),
    ...(ctx.customDietTags ?? []).map((r) => ({ id: r, value: custom(r) })),
  ];
  const activityCats: Category[] = [
    ...ACTIVITIES.map((a) => ({ id: a, value: key(`activity_${a}`) })),
    ...(ctx.customActivities ?? []).map((r) => ({ id: r, value: custom(r) })),
  ];

  return [
    {
      id: 'temperature', labelKey: 'var_temperature', group: 'weather', kind: 'continuous', unit: 'celsius', integer: false,
      buckets: [B('temp_lt10', null, 10), B('temp_10_19', 10, 20), B('temp_20_25', 20, 26), B('temp_26_30', 26, 31), B('temp_gt30', 31, null)],
      value: (f) => f.tempC,
    },
    {
      id: 'humidity', labelKey: 'var_humidity', group: 'weather', kind: 'continuous', unit: 'percent', integer: false,
      buckets: [B('hum_lt30', null, 30), B('hum_30_49', 30, 50), B('hum_50_69', 50, 70), B('hum_gte70', 70, null)],
      value: (f) => f.humidityPct,
    },
    {
      id: 'stress', labelKey: 'var_stress', group: 'stress_sleep', kind: 'continuous', unit: 'score', integer: true,
      buckets: [B('stress_1_3', 1, 4), B('stress_4_6', 4, 7), B('stress_7_10', 7, 11)],
      value: (f) => f.stress,
    },
    {
      id: 'sleep_hours', labelKey: 'var_sleep_hours', group: 'stress_sleep', kind: 'continuous', unit: 'hours', integer: false,
      buckets: [B('sleep_lt6', null, 6), B('sleep_6_8', 6, 8), B('sleep_gte8', 8, null)],
      value: (f) => f.sleepHours,
    },
    {
      id: 'sleep_quality', labelKey: 'var_sleep_quality', group: 'stress_sleep', kind: 'continuous', unit: 'score', integer: true,
      buckets: [B('sleepq_1_2', 1, 3), B('sleepq_3', 3, 4), B('sleepq_4_5', 4, 6)],
      value: (f) => f.sleepQuality,
    },
    {
      id: 'exercise_minutes', labelKey: 'var_exercise_minutes', group: 'exercise', kind: 'continuous', unit: 'minutes', integer: true,
      buckets: [B('exercise_0', 0, 1), B('exercise_1_30', 1, 31), B('exercise_31_60', 31, 61), B('exercise_gt60', 61, null)],
      value: (f) => f.exerciseMin,
    },
    {
      id: 'shower_minutes', labelKey: 'var_shower_minutes', group: 'shower', kind: 'continuous', unit: 'minutes', integer: true,
      buckets: [B('showermin_le5', 0, 6), B('showermin_6_10', 6, 11), B('showermin_11_15', 11, 16), B('showermin_gt15', 16, null)],
      value: (f) => f.showerMin,
    },
    {
      id: 'bedding_days', labelKey: 'var_bedding_days', group: 'bedding', kind: 'continuous', unit: 'days', integer: true,
      buckets: BEDDING_BUCKETS,
      value: (f) => f.beddingDays,
    },
    {
      id: 'sweat', labelKey: 'var_sweat', group: 'exercise', kind: 'ordinal',
      categories: SWEAT_LEVELS.map((s) => ({ id: s, value: key(`sweat_${s}`) })),
      category: (f) => f.sweat,
    },
    {
      id: 'shower_temp', labelKey: 'var_shower_temp', group: 'shower', kind: 'ordinal',
      categories: [
        { id: 'no_shower', value: key('watertemp_no_shower') },
        ...WATER_TEMPS.map((w) => ({ id: w, value: key(`watertemp_${w}`) })),
      ],
      category: (f) => f.shower,
    },
    {
      id: 'cleansing', labelKey: 'var_cleansing', group: 'shower', kind: 'ordinal',
      categories: CLEANSING_LEVELS.map((c) => ({ id: c, value: key(`cleansing_${c}`) })),
      category: (f) => f.cleansing,
    },
    {
      id: 'moisturizer', labelKey: 'var_moisturizer', group: 'shower', kind: 'boolean',
      categories: [
        { id: 'yes', value: key('bool_yes') },
        { id: 'no', value: key('bool_no') },
      ],
      category: (f) => (f.moisturized === null ? null : f.moisturized ? 'yes' : 'no'),
    },
    {
      id: 'activity', labelKey: 'var_activity', group: 'exercise', kind: 'nominal',
      categories: activityCats,
      category: (f) => f.activity as ActivityRef | null,
    },
    {
      id: 'diet', labelKey: 'var_diet', group: 'diet', kind: 'multiTag',
      categories: dietCats,
      tags: (f) => f.diet as readonly DietTagRef[] | null,
    },
    {
      id: 'clothing', labelKey: 'var_clothing', group: 'clothing', kind: 'multiTag',
      categories: CLOTHING_TAGS.map((c) => ({ id: c, value: key(`clothing_${c}`) })),
      tags: (f) => f.clothing,
    },
  ];
}

export const factorKey = (variableId: string, valueId: string): string => `${variableId}:${valueId}`;

export function findVariable(registry: readonly Variable[], id: VariableId): Variable {
  const v = registry.find((x) => x.id === id);
  if (!v) throw new Error(`Unknown variable: ${id}`);
  return v;
}

const inBucket = (x: number, b: Bucket): boolean => (b.min === null || x >= b.min) && (b.max === null || x < b.max);

/** One binary factor per bucket / category / tag of a variable. */
export function factorsForVariable(v: Variable): FactorDef[] {
  const base = { variableId: v.id, variableLabelKey: v.labelKey } as const;
  switch (v.kind) {
    case 'continuous':
      return v.buckets.map((b) => ({
        ...base,
        key: factorKey(v.id, b.id),
        value: { kind: 'range', min: b.min, max: b.max, unit: v.unit, integer: v.integer },
        evaluate: (f) => {
          const x = v.value(f);
          return x === null ? null : inBucket(x, b) ? 1 : 0;
        },
      }));
    case 'multiTag':
      return v.categories.map((c) => ({
        ...base,
        key: factorKey(v.id, c.id),
        value: c.value,
        evaluate: (f) => {
          const tags = v.tags(f);
          return tags === null ? null : tags.includes(c.id) ? 1 : 0;
        },
      }));
    default:
      return v.categories.map((c) => ({
        ...base,
        key: factorKey(v.id, c.id),
        value: c.value,
        evaluate: (f) => {
          const cat = v.category(f);
          return cat === null ? null : cat === c.id ? 1 : 0;
        },
      }));
  }
}

/** Numeric reading for trend tests: raw value for continuous, category rank for ordinal. */
export function numericValue(v: Variable, f: DayFrame): number | null {
  if (v.kind === 'continuous') return v.value(f);
  if (v.kind === 'ordinal') {
    const c = v.category(f);
    if (c === null) return null;
    const i = v.categories.findIndex((x) => x.id === c);
    return i < 0 ? null : i;
  }
  return null;
}

// ---------- Curated composite factors ----------

export interface CompositeDef {
  id: string;
  /** i18n key name for the composite label. */
  labelKey: string;
  op: 'and' | 'or';
  /** Factor keys of the parts. */
  parts: string[];
}

/**
 * A short, curated list (so the multiple-testing burden stays small). These cover the
 * interactions the product cares about: heavy sweat followed by a hot shower, and bedding
 * left unwashed for more than 10 days.
 */
export const DEFAULT_COMPOSITES: CompositeDef[] = [
  {
    id: 'sweat_heavy_and_shower_hot',
    labelKey: 'composite_sweat_heavy_and_shower_hot',
    op: 'and',
    parts: [factorKey('sweat', 'heavy'), factorKey('shower_temp', 'hot')],
  },
  {
    id: 'bedding_gt10',
    labelKey: 'composite_bedding_gt10',
    op: 'or',
    parts: [factorKey('bedding_days', 'bedding_11_14'), factorKey('bedding_days', 'bedding_gt14')],
  },
];

/** Kleene three-valued AND / OR so "unknown" never silently becomes "absent". */
function combine(op: 'and' | 'or', values: (1 | 0 | null)[]): 1 | 0 | null {
  if (op === 'and') {
    if (values.some((v) => v === 0)) return 0;
    return values.every((v) => v === 1) ? 1 : null;
  }
  if (values.some((v) => v === 1)) return 1;
  return values.every((v) => v === 0) ? 0 : null;
}

export function compileComposite(def: CompositeDef, all: readonly FactorDef[]): FactorDef {
  const parts = def.parts.map((k) => {
    const f = all.find((x) => x.key === k);
    if (!f) throw new Error(`Composite ${def.id} references unknown factor ${k}`);
    return f;
  });
  return {
    key: `composite:${def.id}`,
    variableId: 'composite',
    variableLabelKey: 'var_composite',
    value: { kind: 'key', labelKey: def.labelKey },
    evaluate: (f) => combine(def.op, parts.map((p) => p.evaluate(f))),
  };
}

/** Every scannable factor: all variable levels plus the curated composites. */
export function compileAllFactors(
  registry: readonly Variable[],
  composites: readonly CompositeDef[] = DEFAULT_COMPOSITES,
): FactorDef[] {
  const base = registry.flatMap(factorsForVariable);
  return [...base, ...composites.map((c) => compileComposite(c, base))];
}

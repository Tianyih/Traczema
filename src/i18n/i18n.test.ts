import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en, zh, MESSAGES, createTranslator, interpolate, resolveInitialLang, type MessageKey } from './index';
import { formatFactorLabel, formatFactorValue, formatRange } from './format';
import { DATE_LOCALES } from './LanguageContext';
import { formatISO } from '@/lib/date';
import {
  ACTIVITIES, CLEANSING_LEVELS, CLOTHING_TAGS, LESION_STATUSES, PHOTO_TAGS, PRESET_DIET_TAGS,
  REGION_IDS, RESIDUAL_SKIN_STATES, SWEAT_LEVELS, WATER_TEMPS,
} from '@/db/types';
import { LAGS, OVERLAY_TRACKS, SEVERITY_TIERS, TRACK_DEFS, buildRegistry, compileAllFactors } from '@/lib/analytics';
import { d } from '@/test/factories';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('EN / ZH parity (the compile-time guarantee, re-checked at runtime)', () => {
  it('have exactly the same keys', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
  });

  it('every message has the same {placeholders} in both languages', () => {
    for (const key of Object.keys(en) as MessageKey[]) {
      expect(placeholders(zh[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('no message is empty (except the intentionally empty unit_score)', () => {
    for (const lang of ['en', 'zh'] as const) {
      for (const [k, v] of Object.entries(MESSAGES[lang])) {
        if (k === 'unit_score') continue;
        expect(v.trim().length, `${lang}.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('Chinese is actually translated, not a copy of English', () => {
    const same = (Object.keys(en) as MessageKey[]).filter((k) => en[k] === zh[k]);
    expect(same.length / Object.keys(en).length).toBeLessThan(0.1);
    const cjk = (Object.keys(zh) as MessageKey[]).filter((k) => /[一-鿿]/.test(zh[k]));
    expect(cjk.length / Object.keys(zh).length).toBeGreaterThan(0.85);
  });

  it('uses the terminology from the product spec', () => {
    expect(zh.skin_hyperpigmentation).toContain('色素沉着');
    expect(zh.skin_hypopigmentation).toBe('色素减退');
    expect(zh.skin_lichenification).toContain('苔藓样变');
    expect(zh.skin_xerosis).toBe('干燥脱屑');
  });
});

describe('every canonical id has a translation (runtime mirror of coverage.ts)', () => {
  const need = (keys: string[]) => {
    for (const k of keys) {
      expect(Object.prototype.hasOwnProperty.call(en, k), `en.${k}`).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(zh, k), `zh.${k}`).toBe(true);
    }
  };
  it('stored enums', () => {
    need(PRESET_DIET_TAGS.map((x) => `diet_${x}`));
    need(SWEAT_LEVELS.map((x) => `sweat_${x}`));
    need([...WATER_TEMPS.map((x) => `watertemp_${x}`), 'watertemp_no_shower']);
    need(CLEANSING_LEVELS.map((x) => `cleansing_${x}`));
    need(CLOTHING_TAGS.map((x) => `clothing_${x}`));
    need(ACTIVITIES.map((x) => `activity_${x}`));
    need(REGION_IDS.map((x) => `region_${x}`));
    need(LESION_STATUSES.map((x) => `status_${x}`));
    need(RESIDUAL_SKIN_STATES.map((x) => `skin_${x}`));
    need(PHOTO_TAGS.map((x) => `phototag_${x}`));
  });
  it('every label key the ENGINE emits (variables, values, composites, lags, tracks, tiers)', () => {
    const factors = compileAllFactors(buildRegistry());
    need(factors.map((f) => f.variableLabelKey));
    need(factors.flatMap((f) => (f.value.kind === 'key' ? [f.value.labelKey] : [])));
    need(factors.flatMap((f) => (f.value.kind === 'range' ? [`unit_${f.value.unit}`] : [])));
    need(Object.values(LAGS).map((l) => l.labelKey));
    need(OVERLAY_TRACKS.map((id) => TRACK_DEFS[id].labelKey));
    need(SEVERITY_TIERS.map((t) => `tier_${t}`));
    need(['warn_no_data', 'warn_small_sample', 'warn_few_tier_days', 'warn_low_coverage']);
    need(['evidence_strong', 'evidence_moderate', 'evidence_weak', 'evidence_insufficient']);
  });
  it('canonical ids are language-agnostic tokens (lowercase ascii, digits, underscore)', () => {
    const ids = [PRESET_DIET_TAGS, SWEAT_LEVELS, WATER_TEMPS, CLEANSING_LEVELS, CLOTHING_TAGS, ACTIVITIES, REGION_IDS, LESION_STATUSES, RESIDUAL_SKIN_STATES, PHOTO_TAGS].flat();
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/);
  });
});

describe('translator', () => {
  const E = createTranslator('en');
  const Z = createTranslator('zh');

  it('interpolates {params}, leaving unknown placeholders visible', () => {
    expect(E.t('warn_small_sample', { n: 12, min: 30 })).toBe('Only 12 days of data (at least 30 recommended); treat results as exploratory.');
    expect(Z.t('warn_small_sample', { n: 12, min: 30 })).toContain('12');
    expect(interpolate('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}');
    expect(interpolate('plain')).toBe('plain');
  });
  it('plurals: English picks one/other, Chinese has a single form', () => {
    expect(E.tn('days', 1)).toBe('1 day');
    expect(E.tn('days', 2)).toBe('2 days');
    expect(E.tn('days', 0)).toBe('0 days');
    expect(Z.tn('days', 1)).toBe('1 天');
    expect(Z.tn('days', 21)).toBe('21 天');
  });
  it('has() recognises engine label keys at runtime', () => {
    expect(E.has('sweat_heavy')).toBe(true);
    expect(E.has('nope')).toBe(false);
  });
  it('resolveInitialLang: stored choice wins, then browser language, default English', () => {
    expect(resolveInitialLang('zh', 'en-US')).toBe('zh');
    expect(resolveInitialLang('en', 'zh-CN')).toBe('en');
    expect(resolveInitialLang(null, 'zh-CN')).toBe('zh');
    expect(resolveInitialLang(undefined, 'zh-Hant-TW')).toBe('zh');
    expect(resolveInitialLang('fr', 'fr-FR')).toBe('en');
    expect(resolveInitialLang(null, undefined)).toBe('en');
  });
});

describe('explorer wording matches the product spec', () => {
  const E = createTranslator('en');
  const Z = createTranslator('zh');
  it('reproduces the spec example: "Present in 75% of Severe Flare days", "22% of all days", "75% / 22% = 3.41x more likely"', () => {
    expect(E.t('rev_cooccurrence', { pct: '75%', tier: E.t('tier_severe'), both: 6, target: 8 })).toBe('Present in 75% of Severe flare (7–10) days (6 of 8)');
    expect(E.t('rev_baseline', { pct: '22%', present: 22, total: 100 })).toBe('Present in 22% of all logged days (22 of 100)');
    expect(E.t('rev_formula', { co: '75%', base: '22%', lift: '3.41' })).toBe('75% / 22% = 3.41×');
    expect(E.t('rev_lift_text', { lift: '3.41' })).toBe('3.41× more likely');
  });
  it('has the Chinese equivalents with every number intact', () => {
    expect(Z.t('rev_cooccurrence', { pct: '75%', tier: Z.t('tier_severe'), both: 6, target: 8 })).toContain('75%');
    expect(Z.t('rev_cooccurrence', { pct: '75%', tier: Z.t('tier_severe'), both: 6, target: 8 })).toContain('6/8');
    expect(Z.t('rev_lift_text', { lift: '3.41' })).toBe('可能性高出 3.41 倍');
  });
  it('p-values read naturally with a comparator supplied by the caller', () => {
    expect(E.t('rev_sig', { p: '< 0.001', q: '= 0.005' })).toBe('p < 0.001 · q = 0.005');
  });
});

describe('date-fns locale stays in sync with the language', () => {
  it('formats month headers and full dates per language', () => {
    const E = createTranslator('en');
    const Z = createTranslator('zh');
    expect(formatISO(d('2024-03-09'), E.t('fmt_month_year'), DATE_LOCALES.en)).toBe('March 2024');
    expect(formatISO(d('2024-03-09'), Z.t('fmt_month_year'), DATE_LOCALES.zh)).toBe('2024年3月');
    expect(formatISO(d('2024-03-09'), E.t('fmt_full_date'), DATE_LOCALES.en)).toBe('Saturday, March 9, 2024');
    expect(formatISO(d('2024-03-09'), Z.t('fmt_full_date'), DATE_LOCALES.zh)).toBe('2024年3月9日 星期六');
    expect(formatISO(d('2024-03-09'), E.t('fmt_short_date'), DATE_LOCALES.en)).toBe('Mar 9');
    expect(formatISO(d('2024-03-09'), Z.t('fmt_short_date'), DATE_LOCALES.zh)).toBe('3月9日');
  });
  it('week starts on Sunday for English and Monday for Chinese', () => {
    expect(DATE_LOCALES.en.options?.weekStartsOn).toBe(0);
    expect(DATE_LOCALES.zh.options?.weekStartsOn).toBe(1);
  });
});

describe('UI-side formatting of engine descriptors', () => {
  const E = createTranslator('en');
  const Z = createTranslator('zh');
  const range = (min: number | null, max: number | null, unit: Parameters<typeof formatRange>[3], integer: boolean) => [formatRange(E, min, max, unit, integer), formatRange(Z, min, max, unit, integer)];

  it('integer buckets render inclusive ranges: [4,8) -> "4–7 days"', () => {
    expect(range(4, 8, 'days', true)).toEqual(['4–7 days', '4–7 天']);
    expect(range(0, 4, 'days', true)).toEqual(['0–3 days', '0–3 天']);
    expect(range(15, null, 'days', true)).toEqual(['>14 days', '>14 天']);
    expect(range(0, 1, 'minutes', true)).toEqual(['0 min', '0 分钟']);
    expect(range(3, 4, 'score', true)).toEqual(['3', '3']);
  });
  it('continuous buckets keep their bounds: [10,20) -> "10–20°C", open ends use < and ≥', () => {
    expect(range(10, 20, 'celsius', false)).toEqual(['10–20°C', '10–20°C']);
    expect(range(null, 10, 'celsius', false)).toEqual(['<10°C', '<10°C']);
    expect(range(70, null, 'percent', false)[0]).toBe('≥70%');
  });
  it('composes "Variable: Value" and resolves keys, ranges, composites and custom tags', () => {
    const f = compileAllFactors(buildRegistry({ customDietTags: ['custom:abc'] }));
    const label = (key: string, tr = E, custom?: Map<`custom:${string}`, string>) => {
      const x = f.find((y) => y.key === key)!;
      return formatFactorLabel(tr, x.variableLabelKey, x.value, custom);
    };
    expect(label('diet:dairy')).toBe('Diet: Dairy');
    expect(label('diet:dairy', Z)).toBe('饮食：乳制品');
    expect(label('sweat:heavy')).toBe('Sweat volume: Heavy');
    expect(label('bedding_days:bedding_11_14')).toBe('Days since bedding wash: 11–14 days');
    expect(label('composite:bedding_gt10')).toBe('Bedding unwashed > 10 days');
    expect(label('composite:bedding_gt10', Z)).toBe('床品超过10天未清洗');
    // user-authored tag labels are shown as typed in BOTH languages
    const custom = new Map([['custom:abc', 'Mango'] as const]);
    expect(label('diet:custom:abc', E, custom)).toBe('Diet: Mango');
    expect(label('diet:custom:abc', Z, custom)).toBe('饮食：Mango');
    expect(formatFactorValue(E, { kind: 'custom', ref: 'custom:zzz' })).toBe('custom:zzz'); // unknown ref degrades visibly
  });
});

// Architectural guard: labels are resolved ONLY in the UI layer.
describe('boundary: no i18n in the data layer, derivation layer or analytics engine', () => {
  const root = join(__dirname, '..');
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const sources = (dir: string) => walk(join(root, dir)).filter((p) => /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p));
  const importsI18n = (file: string) => /from\s+['"](@\/i18n|(\.{1,2}\/)+i18n)(\/[^'"]*)?['"]/.test(readFileSync(file, 'utf8'));

  it.each(['db', 'lib'])('src/%s never imports src/i18n', (dir) => {
    const offenders = sources(dir).filter(importsI18n).map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
  it('the guard actually inspects files (not vacuously empty)', () => {
    expect(sources('lib').length).toBeGreaterThan(10);
    expect(sources('db').length).toBeGreaterThan(5);
  });
});

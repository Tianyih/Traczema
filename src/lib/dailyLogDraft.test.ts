import { describe, expect, it } from 'vitest';
import {
  assumedDaysAgo, defaultBedding, defaultShower, defaultWeather, isLogEmpty, logsWithDraft, normalizeForSave,
  parseNumberInput, sameLogContent, toggleIn, withAssumedDaysAgo,
} from './dailyLogDraft';
import { deriveBeddingForDate } from './derive/bedding';
import { d, dailyLog } from '@/test/factories';

describe('parseNumberInput', () => {
  it('empty / junk -> null, numbers (incl. 0 and negatives) preserved', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput('  ')).toBeNull();
    expect(parseNumberInput('abc')).toBeNull();
    expect(parseNumberInput('0')).toBe(0);
    expect(parseNumberInput('-3.5')).toBe(-3.5);
    expect(parseNumberInput(' 7.5 ')).toBe(7.5);
  });
});

describe('normalizeForSave / isLogEmpty', () => {
  it('a fresh log is empty; any recorded value (even 0) is not', () => {
    expect(isLogEmpty(dailyLog(d('2024-05-01')))).toBe(true);
    expect(isLogEmpty(dailyLog(d('2024-05-01'), { overallSeverity: 0 }))).toBe(false); // 0 is a rating
    expect(isLogEmpty(dailyLog(d('2024-05-01'), { dietTags: [] }))).toBe(false); // explicitly "no trigger foods"
    expect(isLogEmpty(dailyLog(d('2024-05-01'), { notes: '   ' }))).toBe(true);
  });

  it('collapses sections with no information back to null (not recorded)', () => {
    const n = normalizeForSave(dailyLog(d('2024-05-01'), {
      weather: defaultWeather(), exercise: { durationMin: null, activity: null, sweat: null },
      sleep: { hours: null, quality: null }, clothing: [], bedding: defaultBedding(),
    }));
    expect([n.weather, n.exercise, n.sleep, n.clothing, n.bedding]).toEqual([null, null, null, null, null]);
  });

  it('keeps meaningful sections: "no shower", "took a shower" without details, and 0 minutes of exercise', () => {
    expect(normalizeForSave(dailyLog(d('2024-05-01'), { shower: defaultShower(false) })).shower).toEqual(defaultShower(false));
    expect(normalizeForSave(dailyLog(d('2024-05-01'), { shower: defaultShower(true) })).shower?.took).toBe(true);
    expect(normalizeForSave(dailyLog(d('2024-05-01'), { exercise: { durationMin: 0, activity: null, sweat: null } })).exercise).not.toBeNull();
  });

  it('"no shower" discards stale shower details', () => {
    const n = normalizeForSave(dailyLog(d('2024-05-01'), { shower: { took: false, durationMin: 10, waterTemp: 'hot', cleansing: 'moderate', moisturizedWithin3Min: true } }));
    expect(n.shower).toEqual(defaultShower(false));
  });

  it('washing today discards any manual anchor', () => {
    const n = normalizeForSave(dailyLog(d('2024-05-10'), { bedding: { washedToday: true, assumedLastWashDate: d('2024-05-01') } }));
    expect(n.bedding).toEqual({ washedToday: true, assumedLastWashDate: null });
  });

  it('sameLogContent ignores timestamps and normalisation-only differences', () => {
    const a = dailyLog(d('2024-05-01'), { overallSeverity: 3, createdAt: 1, updatedAt: 1 });
    const b = { ...a, createdAt: 99, updatedAt: 100, weather: defaultWeather() };
    expect(sameLogContent(a, b)).toBe(true);
    expect(sameLogContent(a, { ...a, overallSeverity: 4 })).toBe(false);
  });
});

describe('bedding "days ago" <-> stored date', () => {
  it('stores the date (log date − N), never the number', () => {
    const l = withAssumedDaysAgo(dailyLog(d('2024-05-10')), 6);
    expect(l.bedding).toEqual({ washedToday: false, assumedLastWashDate: '2024-05-04' });
    expect(assumedDaysAgo(l)).toBe(6);
    expect(assumedDaysAgo(dailyLog(d('2024-05-10')))).toBeNull();
  });
  it('0 days ago = washed today-ish anchor; invalid / null clears it', () => {
    expect(withAssumedDaysAgo(dailyLog(d('2024-05-10')), 0).bedding?.assumedLastWashDate).toBe('2024-05-10');
    expect(withAssumedDaysAgo(withAssumedDaysAgo(dailyLog(d('2024-05-10')), 6), null).bedding?.assumedLastWashDate).toBeNull();
    expect(withAssumedDaysAgo(dailyLog(d('2024-05-10')), -2).bedding?.assumedLastWashDate).toBeNull();
    expect(withAssumedDaysAgo(dailyLog(d('2024-05-10')), 2.5).bedding?.assumedLastWashDate).toBeNull();
  });
  it('the live counter in the drawer = derivation over stored history with the draft substituted', () => {
    const stored = [dailyLog(d('2024-05-01'), { bedding: { washedToday: true, assumedLastWashDate: null } }), dailyLog(d('2024-05-08'), { notes: 'old' })];
    const draft = dailyLog(d('2024-05-08'), { bedding: { washedToday: false, assumedLastWashDate: null } });
    expect(deriveBeddingForDate(logsWithDraft(stored, draft), d('2024-05-08')).daysSinceWash).toBe(7);
    // toggling "washed today" in the draft resets the counter to 0 immediately
    const washed = { ...draft, bedding: { washedToday: true, assumedLastWashDate: null } };
    expect(deriveBeddingForDate(logsWithDraft(stored, washed), d('2024-05-08')).daysSinceWash).toBe(0);
    expect(logsWithDraft(stored, washed).filter((l) => l.date === '2024-05-08')).toHaveLength(1);
  });
});

describe('toggleIn', () => {
  it('adds and removes while preserving order', () => {
    expect(toggleIn(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(toggleIn(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });
});

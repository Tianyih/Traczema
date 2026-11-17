import { describe, expect, it } from 'vitest';
import {
  daysApart, defaultSeverityFor, initialDraft, isStale, observationOn, previousObservation, regionLogs,
  statusOnDate, STALE_AFTER_DAYS, toggleResidual, unusualTransition, withStatus,
} from './regionObservation';
import { deriveRegionSummary } from './derive/regionTimeline';
import { bodyLog as b, d } from '@/test/factories';

const logs = [
  b('neck', d('2024-06-01'), 'active', 6),
  b('neck', d('2024-06-09'), 'healed', 0, ['hyperpigmentation']),
  b('face', d('2024-06-05'), 'active', 3),
];

describe('per-date lookups', () => {
  it('finds the exact, previous and carried-forward observation', () => {
    expect(observationOn(logs, 'neck', d('2024-06-09'))?.status).toBe('healed');
    expect(observationOn(logs, 'neck', d('2024-06-05'))).toBeNull();
    expect(previousObservation(logs, 'neck', d('2024-06-09'))?.date).toBe('2024-06-01'); // strictly before
    expect(previousObservation(logs, 'neck', d('2024-06-01'))).toBeNull();
    expect(statusOnDate(logs, 'neck', d('2024-06-05'))).toBe('active'); // carried forward
    expect(statusOnDate(logs, 'neck', d('2024-06-09'))).toBe('healed'); // on the day itself
    expect(statusOnDate(logs, 'neck', d('2024-05-30'))).toBeNull();
  });
  it('is region-scoped and sorted', () => {
    expect(regionLogs(logs, 'face')).toHaveLength(1);
    expect(regionLogs([...logs].reverse(), 'neck').map((l) => l.date)).toEqual(['2024-06-01', '2024-06-09']);
  });
});

describe('initialDraft', () => {
  it('opens an existing observation as-is', () => {
    expect(initialDraft(logs, 'neck', d('2024-06-09'))).toEqual({ status: 'healed', severity: 0, residualSkin: ['hyperpigmentation'], notes: '' });
  });
  it('a new day is a follow-up on the previous observation', () => {
    expect(initialDraft(logs, 'neck', d('2024-06-04'))).toMatchObject({ status: 'active', severity: 6, residualSkin: [] });
    expect(initialDraft(logs, 'neck', d('2024-06-20'))).toMatchObject({ status: 'healed', residualSkin: ['hyperpigmentation'] });
  });
  it('the first observation of a region starts as an active flare', () => {
    expect(initialDraft(logs, 'hands_wrists', d('2024-06-04'))).toEqual({ status: 'active', severity: 5, residualSkin: [], notes: '' });
  });
  it('returns copies (editing the draft never mutates stored logs)', () => {
    const draft = initialDraft(logs, 'neck', d('2024-06-09'));
    draft.residualSkin.push('xerosis');
    expect(logs[1]?.residualSkin).toEqual(['hyperpigmentation']);
  });
});

describe('withStatus keeps the draft consistent', () => {
  const active = { status: 'active' as const, severity: 7, residualSkin: [], notes: 'n' };
  it('clear / healed force severity 0', () => {
    expect(withStatus(active, 'healed').severity).toBe(0);
    expect(withStatus(active, 'clear').severity).toBe(0);
  });
  it('active needs severity >= 1', () => {
    expect(withStatus({ ...active, status: 'healed', severity: 0 }, 'active').severity).toBe(5);
    expect(withStatus({ ...active, severity: 0 }, 'active').severity).toBe(5);
  });
  it('healing keeps an in-progress severity, but starts at 3 when coming from a resolved state', () => {
    expect(withStatus(active, 'healing').severity).toBe(7);
    expect(withStatus({ ...active, status: 'healed', severity: 0 }, 'healing').severity).toBe(3);
  });
  it('residual skin is kept only while healing / healed, and notes always survive', () => {
    const healed = { status: 'healed' as const, severity: 0, residualSkin: ['xerosis' as const], notes: 'keep' };
    expect(withStatus(healed, 'healing').residualSkin).toEqual(['xerosis']);
    const flare = withStatus(healed, 'active');
    expect(flare.residualSkin).toEqual([]);
    expect(flare.notes).toBe('keep');
    expect(defaultSeverityFor('clear')).toBe(0);
  });
});

describe('toggleResidual (normal skin is exclusive)', () => {
  it('adds / removes ordinary states', () => {
    expect(toggleResidual([], 'xerosis')).toEqual(['xerosis']);
    expect(toggleResidual(['xerosis', 'lichenification'], 'xerosis')).toEqual(['lichenification']);
  });
  it('normal_skin replaces everything; any other state replaces normal_skin', () => {
    expect(toggleResidual(['xerosis', 'hyperpigmentation'], 'normal_skin')).toEqual(['normal_skin']);
    expect(toggleResidual(['normal_skin'], 'hypopigmentation')).toEqual(['hypopigmentation']);
    expect(toggleResidual(['normal_skin'], 'normal_skin')).toEqual([]);
  });
});

describe('unusualTransition warns but never blocks', () => {
  it('null for the first observation and for usual changes', () => {
    expect(unusualTransition(logs, 'hands_wrists', d('2024-06-04'), 'healed')).toBeNull(); // nothing before
    expect(unusualTransition(logs, 'neck', d('2024-06-05'), 'healing')).toBeNull(); // active -> healing
    expect(unusualTransition(logs, 'neck', d('2024-06-20'), 'active')).toBeNull(); // healed -> active (recurrence)
  });
  it('reports unusual jumps', () => {
    expect(unusualTransition(logs, 'neck', d('2024-06-20'), 'healing')).toEqual({ from: 'healed', to: 'healing' });
    expect(unusualTransition([b('neck', d('2024-06-01'), 'clear')], 'neck', d('2024-06-02'), 'healed')).toEqual({ from: 'clear', to: 'healed' });
  });
});

describe('isStale / daysApart', () => {
  it('flags only an OPEN episode that has not been updated for 14+ days', () => {
    const open = [b('neck', d('2024-06-01'), 'active', 5)];
    expect(isStale(deriveRegionSummary(open, 'neck', d('2024-06-01')))).toBe(false);
    expect(isStale(deriveRegionSummary(open, 'neck', d('2024-06-14')))).toBe(false); // 13 days
    expect(isStale(deriveRegionSummary(open, 'neck', d('2024-06-15')))).toBe(true); // 14 days
    expect(STALE_AFTER_DAYS).toBe(14);
    const closed = [...open, b('neck', d('2024-06-03'), 'healed')];
    expect(isStale(deriveRegionSummary(closed, 'neck', d('2024-08-01')))).toBe(false);
  });
  it('daysApart is symmetric', () => {
    expect(daysApart(d('2024-03-01'), d('2024-03-11'))).toBe(10);
    expect(daysApart(d('2024-03-11'), d('2024-03-01'))).toBe(10);
  });
});

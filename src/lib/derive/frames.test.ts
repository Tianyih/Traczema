import { describe, expect, it } from 'vitest';
import { buildFrames } from './frames';
import { bodyLog, d, dailyLog } from '@/test/factories';

describe('buildFrames', () => {
  const dailyLogs = [
    dailyLog(d('2024-05-01'), {
      overallSeverity: 4,
      itchIntensity: 5,
      stressLevel: 7,
      bedding: { washedToday: true, assumedLastWashDate: null },
      weather: { temperatureC: 21.5, humidityPct: 40, source: 'manual', fetchedAt: null },
      exercise: { durationMin: 45, activity: 'running', sweat: 'heavy' },
      shower: { took: true, durationMin: 12, waterTemp: 'hot', cleansing: 'moderate', moisturizedWithin3Min: false },
      dietTags: ['dairy', 'custom:abc'],
      clothing: ['cotton'],
      sleep: { hours: 6.5, quality: 2 },
    }),
    dailyLog(d('2024-05-03'), { overallSeverity: 7, shower: { took: false, durationMin: null, waterTemp: null, cleansing: null, moisturizedWithin3Min: null } }),
  ];

  it('emits one frame per calendar day, including days with no log', () => {
    const frames = buildFrames({ dailyLogs, bodyPartLogs: [], from: d('2024-05-01'), to: d('2024-05-04') });
    expect(frames.map((f) => f.date)).toEqual(['2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04']);
    expect(frames.map((f) => f.hasLog)).toEqual([true, false, true, false]);
    expect(frames[1]?.severity).toBeNull(); // missing != 0
  });

  it('flattens inputs and derives bedding days', () => {
    const [f1, f2, f3, f4] = buildFrames({ dailyLogs, bodyPartLogs: [], from: d('2024-05-01'), to: d('2024-05-04') });
    expect(f1).toMatchObject({
      severity: 4, itch: 5, stress: 7, tempC: 21.5, humidityPct: 40, exerciseMin: 45, sweat: 'heavy',
      shower: 'hot', showerMin: 12, cleansing: 'moderate', moisturized: false, activity: 'running',
      diet: ['dairy', 'custom:abc'], clothing: ['cotton'], sleepHours: 6.5, sleepQuality: 2,
      beddingDays: 0, beddingWashedToday: true,
    });
    expect([f2?.beddingDays, f3?.beddingDays, f4?.beddingDays]).toEqual([1, 2, 3]);
    expect(f2?.beddingWashedToday).toBeNull(); // no log -> unknown, not "false"
  });

  it('maps "no shower today" explicitly, distinct from "not recorded"', () => {
    const [, f2, f3] = buildFrames({ dailyLogs, bodyPartLogs: [], from: d('2024-05-01'), to: d('2024-05-03') });
    expect(f3?.shower).toBe('no_shower');
    expect(f3?.showerMin).toBeNull();
    expect(f3?.moisturized).toBeNull();
    expect(f2?.shower).toBeNull();
  });

  it('derives bedding from washes that occurred before the requested range', () => {
    const [f] = buildFrames({ dailyLogs, bodyPartLogs: [], from: d('2024-05-10'), to: d('2024-05-10') });
    expect(f?.beddingDays).toBe(9);
  });

  it('adds region state, active-region count and photo counts', () => {
    const body = [
      bodyLog('neck', d('2024-05-02'), 'active', 6),
      bodyLog('face', d('2024-05-02'), 'healing', 3),
      bodyLog('neck', d('2024-05-04'), 'healed'),
    ];
    const frames = buildFrames({
      dailyLogs: [],
      bodyPartLogs: body,
      photoCounts: new Map([[d('2024-05-02'), 2]]),
      from: d('2024-05-01'),
      to: d('2024-05-04'),
    });
    expect(frames.map((f) => f.activeRegionCount)).toEqual([0, 1, 1, 0]);
    expect(frames[1]?.photoCount).toBe(2);
    expect(frames[0]?.regionSeverity.neck).toBeNull();
    expect(frames[1]?.regionSeverity.neck).toBe(6);
    expect(frames[3]?.regionSeverity.neck).toBe(0);
    expect(frames[3]?.regionStatus.face).toBe('healing');
  });
});

import { describe, expect, it } from 'vitest';
import { deriveEpisodes, deriveRegionSummary, regionDayStates } from './regionTimeline';
import { bodyLog as b, d } from '@/test/factories';

const R = 'neck' as const;

describe('lesion lifecycle state machine', () => {
  // Worked example from the design: d1 active(6) -> d4 healing(3) -> d9 healed -> d30 active
  const logs = [
    b(R, d('2024-06-01'), 'active', 6),
    b(R, d('2024-06-04'), 'healing', 3),
    b(R, d('2024-06-09'), 'healed', 0, ['hyperpigmentation']),
    b(R, d('2024-06-30'), 'active', 5),
  ];

  it('derives episodes, days affected and the recurrence flag', () => {
    const eps = deriveEpisodes(logs, R, d('2024-07-02'));
    expect(eps).toHaveLength(2);

    const [e1, e2] = eps;
    expect(e1).toMatchObject({
      index: 1,
      startDate: '2024-06-01',
      endDate: '2024-06-09', // first resolved day, exclusive
      closedAs: 'healed',
      daysAffected: 8,
      daysActive: 3, // Jun 1,2,3
      daysHealing: 5, // Jun 4..8
      peakSeverity: 6,
      peakDate: '2024-06-01',
      isRecurrence: false,
      remissionBeforeDays: null,
      residualSkin: ['hyperpigmentation'],
    });
    expect(e2).toMatchObject({
      index: 2,
      startDate: '2024-06-30',
      endDate: null,
      closedAs: null,
      daysAffected: 3, // Jun 30, Jul 1, Jul 2 (inclusive of asOf)
      isRecurrence: true,
      remissionBeforeDays: 21, // Jun 9 -> Jun 30
    });
  });

  it('summarises the region', () => {
    const s = deriveRegionSummary(logs, R, d('2024-07-02'));
    expect(s).toMatchObject({
      currentStatus: 'active',
      currentSeverity: 5,
      currentEpisodeDays: 3,
      cumulativeDaysAffected: 11,
      episodeCount: 2,
      recurrenceCount: 1,
      avgRemissionDays: 21,
      daysInRemission: null,
      firstLogDate: '2024-06-01',
      lastLogDate: '2024-06-30',
      daysSinceLastLog: 2,
    });
  });

  it('reports remission length while the region is healed', () => {
    const s = deriveRegionSummary(logs.slice(0, 3), R, d('2024-06-20'));
    expect(s.currentEpisode).toBeNull();
    expect(s.daysInRemission).toBe(11);
    expect(s.residualSkinNow).toEqual(['hyperpigmentation']);
    expect(s.cumulativeDaysAffected).toBe(8);
    expect(s.recurrenceCount).toBe(0);
    expect(s.avgRemissionDays).toBeNull();
  });

  it('averages remission over several gaps', () => {
    const many = [
      b(R, d('2024-01-01'), 'active', 5),
      b(R, d('2024-01-05'), 'healed'),
      b(R, d('2024-01-15'), 'active', 4), // gap 10
      b(R, d('2024-01-20'), 'healed'),
      b(R, d('2024-02-09'), 'active', 4), // gap 20
    ];
    const s = deriveRegionSummary(many, R, d('2024-02-10'));
    expect(s.recurrenceCount).toBe(2);
    expect(s.avgRemissionDays).toBe(15);
  });

  it('treats healing -> active as a worsening of the SAME episode, not a recurrence', () => {
    const eps = deriveEpisodes(
      [
        b(R, d('2024-03-01'), 'active', 5),
        b(R, d('2024-03-04'), 'healing', 3),
        b(R, d('2024-03-07'), 'active', 8),
        b(R, d('2024-03-12'), 'healed'),
      ],
      R,
      d('2024-03-20'),
    );
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({ isRecurrence: false, peakSeverity: 8, peakDate: '2024-03-07', daysAffected: 11, daysActive: 3 + 5, daysHealing: 3 });
  });

  it('measures remission from the FIRST resolved day (healed), even if later marked clear', () => {
    const s = deriveRegionSummary(
      [
        b(R, d('2024-04-01'), 'active', 5),
        b(R, d('2024-04-06'), 'healed'),
        b(R, d('2024-04-20'), 'clear'),
        b(R, d('2024-05-01'), 'active', 4),
      ],
      R,
      d('2024-05-01'),
    );
    expect(s.episodes[1]?.remissionBeforeDays).toBe(25); // Apr 6 -> May 1
    expect(s.episodes[0]?.closedAs).toBe('healed');
  });

  it('a region that STARTS clear and later flares is an onset, not a recurrence', () => {
    const s = deriveRegionSummary([b(R, d('2024-04-01'), 'clear'), b(R, d('2024-04-10'), 'active', 5)], R, d('2024-04-10'));
    expect(s.episodes).toHaveLength(1);
    expect(s.recurrenceCount).toBe(0);
    expect(s.episodes[0]?.isRecurrence).toBe(false);
  });

  it('closing straight to clear (never healed) also ends the episode', () => {
    const eps = deriveEpisodes([b(R, d('2024-04-01'), 'active', 3), b(R, d('2024-04-04'), 'clear')], R, d('2024-04-10'));
    expect(eps[0]).toMatchObject({ closedAs: 'clear', daysAffected: 3 });
  });

  it('later healed check-ups refine the post-healing skin state of the last episode', () => {
    const s = deriveRegionSummary(
      [
        b(R, d('2024-04-01'), 'active', 5),
        b(R, d('2024-04-06'), 'healed', 0, ['normal_skin']),
        b(R, d('2024-05-06'), 'healed', 0, ['hyperpigmentation']),
      ],
      R,
      d('2024-05-10'),
    );
    expect(s.episodes[0]?.residualSkin).toEqual(['hyperpigmentation']);
    expect(s.residualSkinNow).toEqual(['hyperpigmentation']);
  });

  it('is total: order-independent, de-duplicated by date, ignores future logs and other regions', () => {
    const shuffled = [logs[3], logs[0], logs[2], logs[1], b('face', d('2024-06-02'), 'active', 9)] as typeof logs;
    expect(deriveEpisodes(shuffled, R, d('2024-07-02'))).toEqual(deriveEpisodes(logs, R, d('2024-07-02')));
    const future = deriveRegionSummary(logs, R, d('2024-06-15'));
    expect(future.episodeCount).toBe(1); // the Jun 30 log is after asOf
    expect(future.currentStatus).toBe('healed');
    const dup = [
      { ...b(R, d('2024-06-01'), 'active', 4), updatedAt: 1 },
      { ...b(R, d('2024-06-01'), 'active', 9), updatedAt: 2, id: 'x' },
    ];
    expect(deriveEpisodes(dup, R, d('2024-06-01'))[0]?.peakSeverity).toBe(9);
  });

  it('defaults to clear with zeroed metrics when there is no data', () => {
    const s = deriveRegionSummary([], R, d('2024-07-02'));
    expect(s).toMatchObject({ currentStatus: 'clear', episodeCount: 0, recurrenceCount: 0, cumulativeDaysAffected: 0, lastLogDate: null, daysSinceLastLog: null });
  });

  it('a recurrence can open directly as healing (total function)', () => {
    const eps = deriveEpisodes([b(R, d('2024-01-01'), 'active', 4), b(R, d('2024-01-05'), 'healed'), b(R, d('2024-01-10'), 'healing', 2)], R, d('2024-01-12'));
    expect(eps[1]).toMatchObject({ isRecurrence: true, remissionBeforeDays: 5, daysHealing: 3, daysActive: 0 });
  });
});

describe('regionDayStates (carried-forward daily state)', () => {
  const logs = [b(R, d('2024-06-01'), 'active', 6), b(R, d('2024-06-04'), 'healed')];

  it('is unknown before the first observation', () => {
    const s = regionDayStates(logs, R, d('2024-05-30'), d('2024-06-02'));
    expect(s[0]).toEqual({ status: null, severity: null });
    expect(s[1]).toEqual({ status: null, severity: null });
    expect(s[2]).toEqual({ status: 'active', severity: 6 });
  });

  it('carries status forever, severity of active/healing for at most maxCarryDays, healed 0 indefinitely', () => {
    const s = regionDayStates([b(R, d('2024-06-01'), 'active', 6)], R, d('2024-06-01'), d('2024-06-12'), 3);
    expect(s.map((x) => x.severity)).toEqual([6, 6, 6, 6, null, null, null, null, null, null, null, null]);
    expect(s.every((x) => x.status === 'active')).toBe(true);

    const healed = regionDayStates(logs, R, d('2024-06-04'), d('2024-07-30'));
    expect(healed.every((x) => x.status === 'healed' && x.severity === 0)).toBe(true);
  });

  it('uses observations from before the window start', () => {
    const s = regionDayStates(logs, R, d('2024-06-03'), d('2024-06-05'));
    expect(s.map((x) => x.status)).toEqual(['active', 'healed', 'healed']);
  });
});

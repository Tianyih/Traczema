/**
 * Deterministic, realistic mock data with PLANTED statistical correlations (CLAUDE.md rule 3).
 *
 * - Pure: the same (seed, endDate, days) always yields the same dataset, independent of the
 *   machine's time zone and language. It emits only canonical keys and numbers — no display text.
 *   Demo notes / photo captions are exposed as i18n KEYS; the seeder resolves them at seed time.
 * - Planted effects are listed in MOCK_GROUND_TRUTH so tests can check that the analytics engine
 *   recovers them (and does not "discover" the null controls).
 *
 * Severity model (continuous latent L, shown as clamp(round(L), 0, 10)):
 *   L[t] = BASE + PERSISTENCE * (L[t-1] - BASE) + effects[t] + noise
 *
 * Planted effects (all tunable in EFFECTS):
 *   1. heavy sweat AND hot shower on day t        -> +flare at t+1     (T+1)   <- in the spec
 *   2. bedding unwashed > 10 days                 -> +flare, plus neck/limb flexural episodes (T+0) <- in the spec
 *   3. dairy on day t                             -> +flare at t+2     (T+2)   demonstrates the lag selector
 *   4. stress >= 7                                -> +flare            (T+0)
 *   5. humidity < 30 %                            -> +flare            (T+0)
 *   6. moisturiser within 3 min of bathing        -> protective        (T+0)
 *   null controls (no effect): silk, wool clothing, soy
 */
import type {
  Activity,
  BodyPartLog,
  CleansingLevel,
  ClothingTag,
  DailyLog,
  DietTagRef,
  LesionStatus,
  PhotoTag,
  RegionId,
  ResidualSkin,
  SweatLevel,
  WaterTemp,
} from '@/db/types';
import { ACTIVITIES, CLOTHING_TAGS, PRESET_DIET_TAGS } from '@/db/types';
import { addDaysISO, eachDayISO, type ISODate } from './date';
import { createRng, type Rng } from './prng';

export const DEFAULT_MOCK_SEED = 20240611;
export const DEFAULT_MOCK_DAYS = 60;

export interface MockOptions {
  seed?: number;
  /** Last day of the generated window (usually today). */
  endDate: ISODate;
  days?: number;
}

export interface MockPhoto {
  date: ISODate;
  regionId: RegionId | null;
  tags: PhotoTag[];
  /** i18n key name for the caption. */
  captionKey: string;
  /** Hue (0–359) of the procedural placeholder image. */
  hue: number;
}

export interface MockDataset {
  seed: number;
  startDate: ISODate;
  endDate: ISODate;
  dailyLogs: DailyLog[];
  bodyPartLogs: BodyPartLog[];
  photos: MockPhoto[];
  /** i18n key name per date; the seeder resolves these into DailyLog.notes. */
  noteKeys: Partial<Record<ISODate, string>>;
}

export interface PlantedEffect {
  /** Factor key as produced by the analytics registry (`variable:value` / `composite:id`). */
  factorKey: string;
  /** Lag at which the effect is strongest. */
  lag: 'T0' | 'T1' | 'T2';
  kind: 'risk' | 'protective' | 'null';
}

export const MOCK_GROUND_TRUTH: readonly PlantedEffect[] = [
  { factorKey: 'composite:sweat_heavy_and_shower_hot', lag: 'T1', kind: 'risk' },
  { factorKey: 'composite:bedding_gt10', lag: 'T0', kind: 'risk' },
  { factorKey: 'diet:dairy', lag: 'T2', kind: 'risk' },
  { factorKey: 'stress:stress_7_10', lag: 'T0', kind: 'risk' },
  { factorKey: 'humidity:hum_lt30', lag: 'T0', kind: 'risk' },
  { factorKey: 'moisturizer:yes', lag: 'T0', kind: 'protective' },
  { factorKey: 'clothing:silk', lag: 'T0', kind: 'null' },
  { factorKey: 'clothing:wool', lag: 'T0', kind: 'null' },
  { factorKey: 'diet:soy', lag: 'T0', kind: 'null' },
];

/** Effect sizes (severity points). Everything planted lives here. */
export const EFFECTS = {
  base: 1.0,
  persistence: 0.4,
  noise: 0.8,
  beddingOver10: 2.6,
  beddingRamp: 0.12, // per extra day beyond 10 (capped at 8)
  heavySweatPrev: 0.6,
  hotShowerPrev: 0.6,
  heavyAndHotPrev: 3.6, // interaction on top of the two singles
  dairyTwoDaysAgo: 2.8,
  stressHigh: 1.9,
  humidityLow: 1.9,
  moisturizer: -1.0,
} as const;

const BASE_TS = 1_700_000_000_000;
const DAY_MS = 86_400_000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round5 = (x: number) => Math.round(x / 5) * 5;
const round05 = (x: number) => Math.round(x * 2) / 2;

function weighted<T>(rng: Rng, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng.next() * total;
  for (const [item, w] of items) {
    r -= w;
    if (r < 0) return item;
  }
  return (items[items.length - 1] as readonly [T, number])[0];
}

interface Exposure {
  temp: number;
  hum: number;
  stress: number;
  sleepHours: number;
  sleepQuality: number;
  exerciseMin: number;
  activity: Activity | null;
  sweat: SweatLevel;
  showerTook: boolean;
  showerMin: number;
  waterTemp: WaterTemp | null;
  cleansing: CleansingLevel | null;
  moisturized: boolean;
  diet: DietTagRef[];
  clothing: ClothingTag[];
  weatherMissing: boolean;
  sleepMissing: boolean;
}

interface Keyframe {
  day: number;
  status: LesionStatus;
  severity: number;
  residual?: ResidualSkin[];
}

export function generateMockData(opts: MockOptions): MockDataset {
  const seed = opts.seed ?? DEFAULT_MOCK_SEED;
  const days = opts.days ?? DEFAULT_MOCK_DAYS;
  const rng = createRng(seed);
  const endDate = opts.endDate;
  const startDate = addDaysISO(endDate, -(days - 1));
  const dates = eachDayISO(startDate, endDate);
  const WARM = 2; // two warm-up days so lagged effects exist from the first real day

  // ---- 1. plan the calendar ------------------------------------------------------------------
  const washDays: number[] = [];
  for (let d = rng.int(3, 5); d < days; d += rng.int(15, 17)) washDays.push(d);
  const washSet = new Set(washDays);
  const ANCHOR_DAYS = 6; // "bedding last washed 6 days before the first entry"

  const candidates = rng.shuffle(Array.from({ length: Math.max(0, days - 4) }, (_, k) => k + 2));
  const comboDays: number[] = [];
  const wantCombos = Math.max(2, Math.round(days * 0.13));
  for (const c of candidates) {
    if (comboDays.length >= wantCombos) break;
    if (washSet.has(c) || comboDays.some((x) => Math.abs(x - c) < 4)) continue;
    comboDays.push(c);
  }
  const comboSet = new Set(comboDays);

  const protectedDays = new Set<number>([0, days - 1, ...washDays, ...comboDays, ...comboDays.map((c) => c + 1)]);
  const skipDays = new Set<number>();
  for (const c of rng.shuffle(Array.from({ length: days }, (_, k) => k))) {
    if (skipDays.size >= Math.round(days / 12)) break;
    if (!protectedDays.has(c)) skipDays.add(c);
  }

  const beddingAt = (i: number): number => {
    let last = -ANCHOR_DAYS;
    for (const w of washDays) if (w <= i) last = w;
    return i - last;
  };

  // stress bursts (e.g. exam / deadline weeks)
  const bursts = [
    [Math.round(days * 0.17), Math.round(days * 0.17) + 4],
    [Math.round(days * 0.63), Math.round(days * 0.63) + 4],
  ] as const;
  const inBurst = (i: number) => bursts.some(([a, b]) => i >= a && i <= b);

  // ---- 2. simulate exposures ---------------------------------------------------------------
  const total = days + WARM;
  const exposures: Exposure[] = [];
  let prevHum = 54;
  let prevStress = 5;
  for (let k = 0; k < total; k++) {
    const i = k - WARM;
    const combo = comboSet.has(i);

    const temp = round05(17 + 7 * Math.sin((2 * Math.PI * k) / 45 + 0.6) + rng.normal(0, 2));
    const hum = clamp(Math.round(54 - 0.5 * (temp - 17) + 0.5 * (prevHum - 54) + rng.normal(0, 17)), 15, 98);
    prevHum = hum;
    const stress = clamp(Math.round(4.8 + 0.55 * (prevStress - 4.8) + rng.normal(0, 1.7) + (inBurst(i) ? 2.5 : 0)), 1, 10);
    prevStress = stress;
    const sleepHours = clamp(round05(7.3 - 0.22 * (stress - 5) + rng.normal(0, 0.8)), 4, 10);
    const sleepQuality = clamp(Math.round(3.5 - 0.25 * (stress - 5) + 0.35 * (sleepHours - 7) + rng.normal(0, 0.7)), 1, 5);

    let exerciseMin = 0;
    let activity: Activity | null = null;
    let sweat: SweatLevel;
    if (combo) {
      exerciseMin = round5(rng.int(60, 90));
      activity = rng.pick(['running', 'gym', 'team_sports', 'cycling'] as const);
      sweat = 'heavy';
    } else if (rng.chance(0.42)) {
      exerciseMin = round5(rng.int(15, 75));
      activity = rng.pick(ACTIVITIES);
      sweat = weighted<SweatLevel>(rng, [['heavy', 0.14], ['moderate', 0.36], ['light', 0.5]]);
    } else {
      sweat =
        temp > 26
          ? weighted<SweatLevel>(rng, [['none', 0.5], ['light', 0.35], ['moderate', 0.15]])
          : weighted<SweatLevel>(rng, [['none', 0.75], ['light', 0.22], ['moderate', 0.03]]);
    }

    const showerTook = combo || rng.chance(0.92);
    const waterTemp: WaterTemp | null = !showerTook
      ? null
      : combo
        ? 'hot'
        : weighted<WaterTemp>(rng, [['cool', 0.06], ['lukewarm', 0.3], ['warm', 0.42], ['hot', 0.22]]);
    const cleansing: CleansingLevel | null = showerTook
      ? weighted<CleansingLevel>(rng, [['water_only', 0.15], ['gentle_hand', 0.45], ['moderate', 0.3], ['vigorous', 0.1]])
      : null;
    const moisturized = showerTook && rng.chance(combo ? 0.3 : 0.55);

    const diet: DietTagRef[] = PRESET_DIET_TAGS.filter((tag) => {
      const p = { dairy: 0.3, eggs: 0.2, seafood: 0.15, nuts: 0.15, soy: 0.2, wheat_gluten: 0.5, spicy: 0.25, alcohol: 0.12, high_sugar: 0.3 }[tag];
      return rng.chance(p);
    });

    const clothing: ClothingTag[] = CLOTHING_TAGS.filter((tag) => {
      const p = { cotton: 0.5, silk: 0.1, wool: 0.12, synthetic: 0.3, tight_friction: 0.2, loose_breathable: 0.5 }[tag];
      return rng.chance(p);
    });
    if (clothing.length === 0) clothing.push('cotton');

    exposures.push({
      temp, hum, stress, sleepHours, sleepQuality, exerciseMin, activity, sweat,
      showerTook, showerMin: showerTook ? (combo ? rng.int(10, 20) : rng.int(4, 18)) : 0,
      waterTemp, cleansing, moisturized, diet, clothing,
      weatherMissing: rng.chance(0.06),
      sleepMissing: rng.chance(0.05),
    });
  }

  // ---- 3. simulate severity ----------------------------------------------------------------
  const E = EFFECTS;
  const latent: number[] = [];
  const severity: number[] = [];
  for (let k = 0; k < total; k++) {
    const i = k - WARM;
    const x = exposures[k] as Exposure;
    const prev = exposures[k - 1];
    const prev2 = exposures[k - 2];
    let e = 0;
    const bd = beddingAt(i);
    if (bd > 10) e += E.beddingOver10 + E.beddingRamp * Math.min(bd - 10, 8);
    if (prev) {
      const heavy = prev.sweat === 'heavy';
      const hot = prev.waterTemp === 'hot';
      if (heavy) e += E.heavySweatPrev;
      if (hot) e += E.hotShowerPrev;
      if (heavy && hot) e += E.heavyAndHotPrev;
    }
    if (prev2?.diet.includes('dairy')) e += E.dairyTwoDaysAgo;
    if (x.stress >= 7) e += E.stressHigh;
    if (x.hum < 30) e += E.humidityLow;
    if (x.moisturized) e += E.moisturizer;
    const before = k === 0 ? E.base : (latent[k - 1] as number);
    const L = E.base + E.persistence * (before - E.base) + e + rng.normal(0, E.noise);
    latent.push(L);
    severity.push(clamp(Math.round(L), 0, 10));
  }

  // ---- 4. daily logs -----------------------------------------------------------------------
  const dailyLogs: DailyLog[] = [];
  const noteKeys: Partial<Record<ISODate, string>> = {};
  for (let i = 0; i < days; i++) {
    if (skipDays.has(i)) continue;
    const k = i + WARM;
    const x = exposures[k] as Exposure;
    const sev = severity[k] as number;
    const date = dates[i] as ISODate;
    const ts = BASE_TS + i * DAY_MS;

    dailyLogs.push({
      date,
      overallSeverity: sev,
      itchIntensity: clamp(Math.round(sev * 0.9 + 1 + rng.normal(0, 1.2)), 0, 10),
      notes: '',
      dietTags: x.diet,
      weather: x.weatherMissing
        ? null
        : { temperatureC: x.temp, humidityPct: x.hum, source: 'open-meteo', fetchedAt: ts },
      exercise: { durationMin: x.exerciseMin, activity: x.activity, sweat: x.sweat },
      shower: {
        took: x.showerTook,
        durationMin: x.showerTook ? x.showerMin : null,
        waterTemp: x.waterTemp,
        cleansing: x.cleansing,
        moisturizedWithin3Min: x.showerTook ? x.moisturized : null,
      },
      clothing: x.clothing,
      bedding: {
        washedToday: washSet.has(i),
        assumedLastWashDate: i === 0 ? addDaysISO(date, -ANCHOR_DAYS) : null,
      },
      stressLevel: x.stress,
      sleep: x.sleepMissing ? null : { hours: x.sleepHours, quality: x.sleepQuality },
      createdAt: ts,
      updatedAt: ts,
    });

    // demo notes (keys only)
    if (comboSet.has(i - 1) && sev >= 5) noteKeys[date] = 'mock_note_flare_after_sweat';
    else if (washSet.has(i)) noteKeys[date] = 'mock_note_fresh_bedding';
    else if (beddingAt(i) > 10 && sev >= 6) noteKeys[date] = 'mock_note_dry_itchy';
    else if (inBurst(i) && x.stress >= 8) noteKeys[date] = 'mock_note_stressful_week';
    else if (sev <= 2 && i % 7 === 3) noteKeys[date] = 'mock_note_calm_day';
  }

  // ---- 5. body-part episodes (scripted around the real bedding windows) --------------------
  const windows: { s: number; e: number }[] = [];
  for (let i = 0; i < days; i++) {
    if (beddingAt(i) > 10) {
      const last = windows[windows.length - 1];
      if (last && last.e === i - 1) last.e = i;
      else windows.push({ s: i, e: i });
    }
  }
  const w = (n: number) => windows[Math.min(n, windows.length - 1)] ?? { s: Math.round(days * 0.3), e: Math.round(days * 0.35) };
  const w1 = w(0);
  const w2 = w(1);
  const w3 = w(2);

  // Keyframe day helpers. `inWin(win, k)` = k days after the window start, clamped INSIDE the
  // window, so severe neck / limb days occur while bedding is overdue; `after(win, k)` = k days
  // after the window ends (healing begins promptly once the sheets are washed).
  const inWin = (win: { s: number; e: number }, k: number) => Math.min(win.s + k, win.e);
  const after = (win: { s: number; e: number }, k: number) => win.e + k;

  const script: Record<string, Keyframe[]> = {
    neck: [
      { day: inWin(w1, 1), status: 'active', severity: 6 },
      { day: inWin(w1, 2), status: 'active', severity: 7 },
      { day: inWin(w1, 3), status: 'active', severity: 8 },
      { day: after(w1, 1), status: 'healing', severity: 5 },
      { day: after(w1, 4), status: 'healing', severity: 3 },
      { day: after(w1, 8), status: 'healed', severity: 0, residual: ['normal_skin'] },
      { day: inWin(w3, 1), status: 'active', severity: 7 },
      { day: inWin(w3, 2), status: 'active', severity: 8 },
      { day: inWin(w3, 4), status: 'active', severity: 8 },
      { day: after(w3, 1), status: 'healing', severity: 5 },
      { day: after(w3, 4), status: 'healing', severity: 3 },
      { day: after(w3, 7), status: 'healing', severity: 2 },
    ],
    antecubital_fossa: [
      { day: inWin(w1, 1), status: 'active', severity: 5 },
      { day: inWin(w1, 3), status: 'active', severity: 7 },
      { day: after(w1, 2), status: 'healing', severity: 4, residual: ['hyperpigmentation'] },
      { day: after(w1, 7), status: 'healed', severity: 0, residual: ['hyperpigmentation'] },
      { day: inWin(w3, 2), status: 'active', severity: 6 },
      { day: inWin(w3, 4), status: 'active', severity: 7 },
      { day: after(w3, 2), status: 'healing', severity: 4, residual: ['hyperpigmentation'] },
    ],
    popliteal_fossa: [
      { day: inWin(w2, 1), status: 'active', severity: 5 },
      { day: inWin(w2, 2), status: 'active', severity: 7 },
      { day: after(w2, 2), status: 'healing', severity: 4, residual: ['lichenification'] },
      { day: after(w2, 8), status: 'healed', severity: 0, residual: ['lichenification'] },
      { day: after(w2, 20), status: 'clear', severity: 0 },
    ],
    forearms: [
      { day: inWin(w3, 2), status: 'active', severity: 5 },
      { day: inWin(w3, 4), status: 'active', severity: 6 },
      { day: after(w3, 2), status: 'healing', severity: 3, residual: ['xerosis'] },
      { day: after(w3, 5), status: 'healing', severity: 2, residual: ['xerosis'] },
    ],
    hands_wrists: [
      { day: Math.round(days * 0.83), status: 'active', severity: 4 },
      { day: Math.round(days * 0.88), status: 'active', severity: 5 },
      { day: Math.round(days * 0.93), status: 'active', severity: 6 },
      { day: days - 1, status: 'active', severity: 6 },
    ],
    face: [
      { day: Math.round(days * 0.12), status: 'active', severity: 3 },
      { day: Math.round(days * 0.17), status: 'healing', severity: 2 },
      { day: Math.round(days * 0.23), status: 'healed', severity: 0, residual: ['normal_skin'] },
      { day: Math.round(days * 0.63), status: 'active', severity: 4 },
      { day: Math.round(days * 0.68), status: 'active', severity: 5 },
      { day: Math.round(days * 0.73), status: 'healing', severity: 3 },
      { day: Math.round(days * 0.8), status: 'healed', severity: 0, residual: ['hypopigmentation'] },
    ],
    scalp: [{ day: 0, status: 'clear', severity: 0 }],
  };

  const bodyPartLogs: BodyPartLog[] = [];
  const photos: MockPhoto[] = [];
  const hueOf = (region: string) => (region.length * 47 + (region.charCodeAt(0) % 40) * 3) % 360;
  for (const [region, rawFrames] of Object.entries(script)) {
    // Clamping can make two keyframes land on the same day; keep days strictly increasing.
    const frames: Keyframe[] = [];
    for (const f of [...rawFrames].sort((x, y) => x.day - y.day)) {
      const prev = frames[frames.length - 1];
      frames.push(prev && f.day <= prev.day ? { ...f, day: prev.day + 1 } : f);
    }
    const seenStatus = new Set<string>();
    for (const f of frames) {
      if (f.day < 0 || f.day > days - 1) continue; // a keyframe falling outside the window is dropped
      const date = dates[f.day] as ISODate;
      const ts = BASE_TS + f.day * DAY_MS;
      bodyPartLogs.push({
        id: `mock-${region}-${date}`,
        regionId: region as RegionId,
        date,
        status: f.status,
        severity: f.severity,
        residualSkin: f.residual ?? [],
        notes: '',
        createdAt: ts,
        updatedAt: ts,
      });
      const photoKey = `${f.status}`;
      if (f.status !== 'clear' && !seenStatus.has(photoKey) && photos.length < 16) {
        seenStatus.add(photoKey);
        photos.push({
          date,
          regionId: region as RegionId,
          tags: f.status === 'active' ? ['flare', 'closeup'] : f.status === 'healing' ? ['healing'] : ['after'],
          captionKey: f.status === 'active' ? 'mock_caption_flare' : f.status === 'healing' ? 'mock_caption_healing' : 'mock_caption_healed',
          hue: hueOf(region),
        });
      }
    }
  }
  // Whole-day overview photos on the two worst days.
  const worst = dailyLogs
    .filter((l) => l.overallSeverity !== null)
    .sort((a, b) => (b.overallSeverity as number) - (a.overallSeverity as number) || (a.date < b.date ? -1 : 1))
    .slice(0, 2);
  for (const l of worst) photos.push({ date: l.date, regionId: null, tags: ['overview'], captionKey: 'mock_caption_overview', hue: 10 });
  photos.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  bodyPartLogs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.regionId < b.regionId ? -1 : 1));

  return { seed, startDate, endDate, dailyLogs, bodyPartLogs, photos, noteKeys };
}

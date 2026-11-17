import { afterEach, describe, expect, it } from 'vitest';
import { clearAllTables, DB_NAMES, deleteDemoDb, getDb, TraczemaDB } from './schema';
import { deleteDailyLog, emptyDailyLog, getDailyLog, listDailyLogs, saveDailyLog } from './repos/dailyLogRepo';
import { deleteBodyPartLog, listBodyPartLogs, upsertBodyPartLog } from './repos/bodyPartRepo';
import { addPhoto, getPhoto, listPhotos, photoCountsByDate } from './repos/photoRepo';
import { createTag, customRef, listTags } from './repos/tagRepo';
import { getSetting, setSetting } from './repos/settingsRepo';
import { placeholderSvg, seedDemoData } from './seed';
import { ValidationError } from './validate';
import { generateMockData } from '@/lib/mockData';
import { buildFrames } from '@/lib/derive/frames';
import { alignFrames, buildRegistry, compileAllFactors, rankTriggerImpact } from '@/lib/analytics';
import { en } from '@/i18n/en';
import { d, dailyLog } from '@/test/factories';
import type { PhotoRecord } from './types';

let counter = 0;
const opened: TraczemaDB[] = [];
const fresh = () => {
  const db = new TraczemaDB(`test-db-${counter++}`);
  opened.push(db);
  return db;
};
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await TraczemaDB.delete(db.name);
  }
});

describe('daily logs', () => {
  it('round-trips a log and preserves createdAt across updates', async () => {
    const db = fresh();
    const first = await saveDailyLog(db, dailyLog(d('2024-05-01'), { overallSeverity: 4, notes: 'hello' }), 1000);
    expect(first).toMatchObject({ createdAt: 1, updatedAt: 1000 });
    const second = await saveDailyLog(db, { ...first, overallSeverity: 6 }, 2000);
    expect(second.createdAt).toBe(1);
    expect(second.updatedAt).toBe(2000);
    expect((await getDailyLog(db, d('2024-05-01')))?.overallSeverity).toBe(6);
    expect(await db.dailyLogs.count()).toBe(1); // date is the primary key: no duplicates
  });

  it('lists oldest-first with optional inclusive bounds, and deletes', async () => {
    const db = fresh();
    for (const day of ['2024-05-03', '2024-05-01', '2024-05-02', '2024-05-04']) await saveDailyLog(db, emptyDailyLog(d(day)));
    expect((await listDailyLogs(db)).map((l) => l.date)).toEqual(['2024-05-01', '2024-05-02', '2024-05-03', '2024-05-04']);
    expect((await listDailyLogs(db, d('2024-05-02'), d('2024-05-03'))).map((l) => l.date)).toEqual(['2024-05-02', '2024-05-03']);
    expect((await listDailyLogs(db, d('2024-05-03'))).length).toBe(2);
    expect((await listDailyLogs(db, undefined, d('2024-05-02'))).length).toBe(2);
    await deleteDailyLog(db, d('2024-05-01'));
    expect(await getDailyLog(db, d('2024-05-01'))).toBeUndefined();
  });

  it('keeps "not recorded" (null) distinct from zero', async () => {
    const db = fresh();
    await saveDailyLog(db, emptyDailyLog(d('2024-05-01')));
    const log = await getDailyLog(db, d('2024-05-01'));
    expect(log?.overallSeverity).toBeNull();
    expect(log?.dietTags).toBeNull();
  });

  it('rejects invalid input before writing', async () => {
    const db = fresh();
    const bad = (over: Partial<ReturnType<typeof emptyDailyLog>>) => saveDailyLog(db, { ...emptyDailyLog(d('2024-05-01')), ...over });
    await expect(bad({ overallSeverity: 11 })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ overallSeverity: 2.5 })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ stressLevel: 0 })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ sleep: { hours: 7.3, quality: 3 } })).rejects.toThrow(/0\.5/);
    await expect(bad({ sleep: { hours: 7.5, quality: 6 } })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ weather: { temperatureC: 20, humidityPct: 140, source: 'manual', fetchedAt: null } })).rejects.toBeInstanceOf(ValidationError);
    await expect(bad({ bedding: { washedToday: false, assumedLastWashDate: d('2024-06-01') } })).rejects.toThrow(/after the log date/);
    await expect(bad({ date: '2024-02-30' as never })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.dailyLogs.count()).toBe(0);
    await expect(bad({ overallSeverity: 0, stressLevel: 10, sleep: { hours: 7.5, quality: 5 } })).resolves.toBeDefined(); // boundaries OK
  });
});

describe('body-part logs', () => {
  const ids = (() => { let n = 0; return () => `id-${n++}`; })();

  it('upserts by (region, date): one observation per region per day, id and createdAt preserved', async () => {
    const db = fresh();
    const a = await upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-01'), status: 'active', severity: 5 }, 10, ids);
    const b = await upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-01'), status: 'active', severity: 8, notes: 'worse' }, 20, ids);
    expect(b.id).toBe(a.id);
    expect(b).toMatchObject({ createdAt: 10, updatedAt: 20, severity: 8, notes: 'worse' });
    expect(await db.bodyPartLogs.count()).toBe(1);
    await upsertBodyPartLog(db, { regionId: 'face', date: d('2024-05-01'), status: 'active', severity: 3 }, 30, ids);
    expect(await db.bodyPartLogs.count()).toBe(2);
  });

  it('the unique compound index rejects a duplicate that bypasses the repo', async () => {
    const db = fresh();
    const row = await upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-01'), status: 'active', severity: 5 });
    await expect(db.bodyPartLogs.add({ ...row, id: 'another' })).rejects.toThrow();
  });

  it('normalises lifecycle invariants: severity 0 when clear/healed; residual skin only when healing/healed', async () => {
    const db = fresh();
    const healed = await upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-09'), status: 'healed', severity: 7, residualSkin: ['hyperpigmentation'] });
    expect(healed.severity).toBe(0);
    expect(healed.residualSkin).toEqual(['hyperpigmentation']);
    const active = await upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-10'), status: 'active', severity: 4, residualSkin: ['xerosis'] });
    expect(active.residualSkin).toEqual([]); // dropped, not stored
  });

  it('rejects states that cannot be normalised away', async () => {
    const db = fresh();
    await expect(upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-01'), status: 'active', severity: 0 })).rejects.toThrow(/at least 1/);
    await expect(upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-01'), status: 'healing', severity: 11 })).rejects.toBeInstanceOf(ValidationError);
    await expect(upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-01'), status: 'healed', severity: 0, residualSkin: ['normal_skin', 'xerosis'] })).rejects.toThrow(/cannot be combined/);
    await expect(upsertBodyPartLog(db, { regionId: 'nose' as never, date: d('2024-05-01'), status: 'clear', severity: 0 })).rejects.toThrow(/unknown region/);
  });

  it('lists oldest-first and filters by region; deletes by id', async () => {
    const db = fresh();
    await upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-05'), status: 'active', severity: 5 }, 1, ids);
    const first = await upsertBodyPartLog(db, { regionId: 'neck', date: d('2024-05-02'), status: 'active', severity: 5 }, 1, ids);
    await upsertBodyPartLog(db, { regionId: 'face', date: d('2024-05-03'), status: 'active', severity: 5 }, 1, ids);
    expect((await listBodyPartLogs(db)).map((l) => l.date)).toEqual(['2024-05-02', '2024-05-03', '2024-05-05']);
    expect((await listBodyPartLogs(db, 'neck')).map((l) => l.date)).toEqual(['2024-05-02', '2024-05-05']);
    await deleteBodyPartLog(db, first.id);
    expect(await listBodyPartLogs(db, 'neck')).toHaveLength(1);
  });
});

describe('photos and tags', () => {
  const photo = (id: string, date: string, regionId: PhotoRecord['regionId'], createdAt: number): PhotoRecord => ({
    id, date: d(date), regionId, blob: new Blob(['abc'], { type: 'image/jpeg' }), thumb: new Blob(['a'], { type: 'image/jpeg' }),
    mime: 'image/jpeg', width: 10, height: 10, bytes: 3, tags: ['flare'], caption: '', createdAt,
  });

  it('stores Blobs, filters by date / region, and counts per day without loading images', async () => {
    const db = fresh();
    await addPhoto(db, photo('a', '2024-05-01', 'neck', 2));
    await addPhoto(db, photo('b', '2024-05-01', null, 1));
    await addPhoto(db, photo('c', '2024-05-03', 'neck', 3));
    const back = await getPhoto(db, 'a');
    expect(back?.blob).toBeInstanceOf(Blob);
    expect(back?.blob.size).toBe(3);
    expect((await listPhotos(db, { date: d('2024-05-01') })).map((p) => p.id)).toEqual(['b', 'a']);
    expect((await listPhotos(db, { regionId: 'neck' })).map((p) => p.id)).toEqual(['a', 'c']);
    expect((await listPhotos(db, { regionId: 'neck', date: d('2024-05-03') })).map((p) => p.id)).toEqual(['c']);
    expect(Object.fromEntries(await photoCountsByDate(db))).toEqual({ '2024-05-01': 2, '2024-05-03': 1 });
  });

  it('custom tags are unique per (kind, label), trimmed, and addressable as custom: refs', async () => {
    const db = fresh();
    const a = await createTag(db, 'diet', '  Mango  ', 1, () => 'id-1');
    const again = await createTag(db, 'diet', 'Mango', 2, () => 'id-2');
    const sameLabelOtherKind = await createTag(db, 'activity', 'Mango', 3, () => 'id-3');
    expect(again.id).toBe(a.id);
    expect(sameLabelOtherKind.id).toBe('id-3');
    expect(a.label).toBe('Mango');
    expect(customRef(a)).toBe('custom:id-1');
    expect((await listTags(db, 'diet')).map((t) => t.label)).toEqual(['Mango']);
    await expect(createTag(db, 'diet', '   ')).rejects.toThrow(/empty/);
  });

  it('settings round-trip', async () => {
    const db = fresh();
    expect(await getSetting(db, 'x')).toBeUndefined();
    await setSetting(db, 'x', { a: 1 });
    expect(await getSetting(db, 'x')).toEqual({ a: 1 });
  });
});

describe('demo data seeder (separate demo database)', () => {
  const resolve = (key: string) => (key in en ? (en as Record<string, string>)[key]! : key);
  const END = d('2024-06-30');

  it('fills the database with 60 days of data and resolves notes/captions via the injected resolver', async () => {
    const db = fresh();
    const res = await seedDemoData(db, { endDate: END }, resolve);
    const logs = await listDailyLogs(db);
    expect(res.dailyLogs).toBe(logs.length);
    expect(logs.length).toBeGreaterThanOrEqual(52);
    expect(logs.some((l) => l.notes.length > 0)).toBe(true);
    expect(logs.every((l) => !l.notes.startsWith('mock_'))).toBe(true); // keys were resolved to text
    expect(await db.bodyPartLogs.count()).toBe(res.bodyPartLogs);
    const photos = await listPhotos(db);
    expect(photos.length).toBe(res.photos);
    expect(photos[0]?.blob).toBeInstanceOf(Blob);
    expect(photos[0]?.mime).toBe('image/svg+xml');
    expect(photos.every((p) => p.caption.length > 0 && !p.caption.startsWith('mock_'))).toBe(true);
  });

  it('seeding twice REPLACES (no duplicates), and clearing empties every table', async () => {
    const db = fresh();
    const a = await seedDemoData(db, { endDate: END }, resolve);
    const b = await seedDemoData(db, { endDate: END }, resolve);
    expect(b).toEqual(a);
    expect(await db.dailyLogs.count()).toBe(a.dailyLogs);
    await clearAllTables(db);
    for (const t of db.tables) expect(await t.count(), t.name).toBe(0);
  });

  it('end-to-end: persisted data -> frames -> engine gives the same findings as the in-memory dataset', async () => {
    const db = fresh();
    await seedDemoData(db, { endDate: END }, resolve);
    const stored = buildFrames({
      dailyLogs: await listDailyLogs(db),
      bodyPartLogs: await listBodyPartLogs(db),
      photoCounts: await photoCountsByDate(db),
      from: d('2024-05-02'),
      to: END,
    });
    const ds = generateMockData({ endDate: END });
    const direct = buildFrames({ dailyLogs: ds.dailyLogs, bodyPartLogs: ds.bodyPartLogs, from: ds.startDate, to: ds.endDate });
    const factors = compileAllFactors(buildRegistry());
    const top = (frames: typeof stored) => rankTriggerImpact(alignFrames(frames, { lag: 'T1' }), factors, { lag: 'T1' }).ranked.slice(0, 3).map((f) => [f.factorKey, f.counts.both]);
    expect(top(stored)).toEqual(top(direct));
    expect(stored.some((f) => f.photoCount > 0)).toBe(true);
  });

  it('demo and real databases are physically separate: seeding/clearing demo never touches real data', async () => {
    const real = getDb('real');
    const demo = getDb('demo');
    expect(real.name).toBe(DB_NAMES.real);
    expect(demo.name).toBe(DB_NAMES.demo);
    expect(real.name).not.toBe(demo.name);
    await clearAllTables(real);
    await saveDailyLog(real, dailyLog(d('2024-05-15'), { overallSeverity: 9, notes: 'my real day' }));

    await seedDemoData(demo, { endDate: END }, resolve); // includes 2024-05-15, a date the demo also covers
    expect(await real.dailyLogs.count()).toBe(1);
    expect((await getDailyLog(real, d('2024-05-15')))?.notes).toBe('my real day');
    expect((await getDailyLog(demo, d('2024-05-15')))?.notes).not.toBe('my real day');

    await deleteDemoDb();
    expect(await real.dailyLogs.count()).toBe(1);
    expect((await getDailyLog(real, d('2024-05-15')))?.overallSeverity).toBe(9);
    // the demo DB is empty again when reopened
    expect(await getDb('demo').dailyLogs.count()).toBe(0);

    await clearAllTables(real);
    real.close();
    getDb('demo').close();
  });

  it('placeholder images are valid, escaped SVG', () => {
    const svg = placeholderSvg(120, '<script>"&');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('hsl(120 ');
  });
});

describe('saving a whole day (log + photos, one transaction)', () => {
  const blob = () => new Blob(['img'], { type: 'image/jpeg' });
  const ph = (id: string, date: string, regionId: PhotoRecord['regionId'], createdAt: number): PhotoRecord => ({
    id, date: d(date), regionId, blob: blob(), thumb: blob(), mime: 'image/jpeg', width: 4, height: 4, bytes: 3, tags: [], caption: '', createdAt,
  });

  it('stores the log and photos; reloading returns both', async () => {
    const { loadDay, saveDay } = await import('./repos/dayRepo');
    const db = fresh();
    const res = await saveDay(db, { log: dailyLog(d('2024-05-01'), { overallSeverity: 5 }), photos: [ph('b', '2024-05-01', null, 2), ph('a', '2024-05-01', null, 1)], removedPhotoIds: [] }, 500);
    expect(res.logStored).toBe(true);
    const day = await loadDay(db, d('2024-05-01'));
    expect(day.log?.overallSeverity).toBe(5);
    expect(day.log?.updatedAt).toBe(500);
    expect(day.photos.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('keeps createdAt on update, applies removals, and leaves body-part photos for the date alone', async () => {
    const { loadDay, saveDay } = await import('./repos/dayRepo');
    const db = fresh();
    await saveDay(db, { log: dailyLog(d('2024-05-01'), { overallSeverity: 5, createdAt: 7 }), photos: [ph('a', '2024-05-01', null, 1)], removedPhotoIds: [] }, 100);
    await db.photos.put(ph('neck-1', '2024-05-01', 'neck', 3));
    const first = await db.dailyLogs.get(d('2024-05-01'));
    await saveDay(db, { log: { ...first!, overallSeverity: 8 }, photos: [ph('c', '2024-05-01', null, 4)], removedPhotoIds: ['a'] }, 200);
    const day = await loadDay(db, d('2024-05-01'));
    expect(day.log).toMatchObject({ overallSeverity: 8, createdAt: 7, updatedAt: 200 });
    expect(day.photos.map((p) => p.id)).toEqual(['c']);
    expect((await db.photos.get('neck-1'))?.regionId).toBe('neck'); // untouched
  });

  it('an empty log is not stored (and removes a previously stored one) but photos still are', async () => {
    const { loadDay, saveDay } = await import('./repos/dayRepo');
    const db = fresh();
    const res = await saveDay(db, { log: dailyLog(d('2024-05-02')), photos: [ph('p', '2024-05-02', null, 1)], removedPhotoIds: [] });
    expect(res.logStored).toBe(false);
    expect((await loadDay(db, d('2024-05-02'))).log).toBeNull();
    expect((await loadDay(db, d('2024-05-02'))).photos).toHaveLength(1);

    await saveDay(db, { log: dailyLog(d('2024-05-03'), { overallSeverity: 4 }), photos: [], removedPhotoIds: [] });
    await saveDay(db, { log: dailyLog(d('2024-05-03')), photos: [], removedPhotoIds: [] }); // user cleared everything
    expect(await db.dailyLogs.get(d('2024-05-03'))).toBeUndefined();
  });

  it('normalises on save: unrecorded sections stay null, "no shower" drops stale details', async () => {
    const { saveDay } = await import('./repos/dayRepo');
    const db = fresh();
    await saveDay(db, {
      log: dailyLog(d('2024-05-04'), {
        overallSeverity: 3,
        weather: { temperatureC: null, humidityPct: null, source: 'manual', fetchedAt: null },
        shower: { took: false, durationMin: 12, waterTemp: 'hot', cleansing: null, moisturizedWithin3Min: true },
        clothing: [],
      }),
      photos: [], removedPhotoIds: [],
    });
    const saved = await db.dailyLogs.get(d('2024-05-04'));
    expect(saved?.weather).toBeNull();
    expect(saved?.clothing).toBeNull();
    expect(saved?.shower).toEqual({ took: false, durationMin: null, waterTemp: null, cleansing: null, moisturizedWithin3Min: null });
  });

  it('is atomic: an invalid log aborts the whole save, photos included', async () => {
    const { saveDay } = await import('./repos/dayRepo');
    const db = fresh();
    await expect(saveDay(db, { log: dailyLog(d('2024-05-05'), { overallSeverity: 99 }), photos: [ph('x', '2024-05-05', null, 1)], removedPhotoIds: [] })).rejects.toBeInstanceOf(ValidationError);
    expect(await db.photos.count()).toBe(0);
    expect(await db.dailyLogs.count()).toBe(0);
  });

  it('deleteDay removes the log and whole-day photos only', async () => {
    const { deleteDay, saveDay } = await import('./repos/dayRepo');
    const db = fresh();
    await saveDay(db, { log: dailyLog(d('2024-05-06'), { overallSeverity: 2 }), photos: [ph('g', '2024-05-06', null, 1)], removedPhotoIds: [] });
    await db.photos.put(ph('r', '2024-05-06', 'face', 2));
    await deleteDay(db, d('2024-05-06'));
    expect(await db.dailyLogs.get(d('2024-05-06'))).toBeUndefined();
    expect((await db.photos.toArray()).map((p) => p.id)).toEqual(['r']);
  });
});

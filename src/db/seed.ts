import { generateMockData, type MockDataset, type MockOptions } from '@/lib/mockData';
import { clearAllTables, type TraczemaDB } from './schema';
import type { DailyLog, PhotoRecord } from './types';

/** Turns an i18n key name into text in the active language (injected so `db/` never imports i18n). */
export type ResolveText = (key: string) => string;

/** A procedural, privacy-safe placeholder "photo": a soft radial gradient in the given hue. */
export function placeholderSvg(hue: number, label: string): string {
  const safe = label.replace(/[<>&"]/g, '');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">` +
    `<defs><radialGradient id="g" cx="50%" cy="45%" r="65%">` +
    `<stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${hue} 55% 34%)"/>` +
    `</radialGradient></defs><rect width="480" height="360" fill="url(#g)"/>` +
    `<text x="240" y="330" text-anchor="middle" font-size="20" fill="white" opacity="0.85">${safe}</text></svg>`
  );
}

export interface SeedResult {
  dailyLogs: number;
  bodyPartLogs: number;
  photos: number;
}

/**
 * Replace the contents of `db` (which must be the DEMO database) with a freshly generated
 * dataset. Notes and photo captions are resolved through `resolveText` once, at seed time.
 */
export async function seedDemoData(
  db: TraczemaDB,
  options: MockOptions,
  resolveText: ResolveText,
  dataset: MockDataset = generateMockData(options),
): Promise<SeedResult> {
  const logs: DailyLog[] = dataset.dailyLogs.map((l) => {
    const key = dataset.noteKeys[l.date];
    return key ? { ...l, notes: resolveText(key) } : l;
  });

  const photos: PhotoRecord[] = dataset.photos.map((p, i) => {
    const caption = resolveText(p.captionKey);
    const blob = new Blob([placeholderSvg(p.hue, caption)], { type: 'image/svg+xml' });
    return {
      id: `mock-photo-${i}`,
      date: p.date,
      regionId: p.regionId,
      blob,
      thumb: blob,
      mime: 'image/svg+xml',
      width: 480,
      height: 360,
      bytes: blob.size,
      tags: p.tags,
      caption,
      createdAt: 1_700_000_000_000 + i,
    };
  });

  await clearAllTables(db);
  await db.transaction('rw', db.dailyLogs, db.bodyPartLogs, db.photos, async () => {
    await db.dailyLogs.bulkPut(logs);
    await db.bodyPartLogs.bulkPut(dataset.bodyPartLogs);
    await db.photos.bulkPut(photos);
  });
  return { dailyLogs: logs.length, bodyPartLogs: dataset.bodyPartLogs.length, photos: photos.length };
}

import { useCallback, useRef, useState } from 'react';
import type { PhotoDraft } from '@/components/daily-log/types';
import type { PhotoRecord, RegionId } from '@/db/types';
import type { MessageKey } from '@/i18n';
import type { ISODate } from '@/lib/date';
import { ImageError, processImageFile } from '@/lib/images/processImage';

const signature = (photos: readonly Pick<PhotoRecord, 'id' | 'tags' | 'caption'>[]) => JSON.stringify(photos.map((p) => [p.id, p.tags, p.caption]));

export interface UsePhotoDraftsOptions {
  date: ISODate;
  /** null = whole-day photos (daily log); a region id = photos of that body part. */
  regionId: RegionId | null;
  initial: PhotoRecord[];
}

/**
 * Editing state for the photos of one day (and optionally one body part): add (resize + strip EXIF),
 * tag / caption, remove. Nothing is written until the caller saves; `markSaved()` then re-baselines
 * so a second edit-and-save in the same session diffs against what is now stored.
 */
export function usePhotoDrafts({ date, regionId, initial }: UsePhotoDraftsOptions) {
  const [photos, setPhotos] = useState<PhotoDraft[]>(() => initial.map((p) => ({ ...p, isNew: false })));
  const [saved, setSaved] = useState(() => ({ sig: signature(initial), ids: initial.map((p) => p.id) }));
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      setErrorKey(null);
      const added: PhotoDraft[] = [];
      for (const file of files) {
        try {
          const img = await processImageFile(file);
          added.push({
            id: crypto.randomUUID(), date, regionId, blob: img.blob, thumb: img.thumb, mime: img.mime, width: img.width,
            height: img.height, bytes: img.bytes, tags: [], caption: '', createdAt: Date.now() + added.length, isNew: true,
          });
        } catch (e) {
          setErrorKey(e instanceof ImageError ? (`photo_err_${e.code}` as MessageKey) : 'photo_err_unsupported');
        }
      }
      setPhotos((p) => [...p, ...added]);
      setBusy(false);
    },
    [date, regionId],
  );

  const patch = useCallback((id: string, change: Partial<PhotoDraft>) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p))), []);
  const remove = useCallback((id: string) => setPhotos((ps) => ps.filter((p) => p.id !== id)), []);

  const keep = new Set(photos.map((p) => p.id));
  return {
    photos,
    busy,
    errorKey,
    addFiles,
    patch,
    remove,
    dirty: signature(photos) !== saved.sig,
    /** Photos that were stored when editing began (or last saved) and have since been removed. */
    removedIds: saved.ids.filter((id) => !keep.has(id)),
    toRecords: (): PhotoRecord[] => photos.map(({ isNew: _isNew, ...rec }) => rec),
    markSaved: () => setSaved({ sig: signature(photosRef.current), ids: photosRef.current.map((p) => p.id) }),
  };
}

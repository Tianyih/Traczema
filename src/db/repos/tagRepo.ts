import type { TraczemaDB } from '../schema';
import type { CustomRef, ID, TagDef, TagKind } from '../types';

export const listTags = (db: TraczemaDB, kind: TagKind) => db.tagDefs.where('kind').equals(kind).toArray();

/** Create a custom tag, or return the existing one with the same (kind, label). */
export async function createTag(
  db: TraczemaDB,
  kind: TagKind,
  label: string,
  now: number = Date.now(),
  newId: () => ID = () => crypto.randomUUID(),
): Promise<TagDef> {
  const clean = label.trim();
  if (!clean) throw new Error('Tag label must not be empty');
  return db.transaction('rw', db.tagDefs, async () => {
    const existing = await db.tagDefs.where('[kind+label]').equals([kind, clean]).first();
    if (existing) return existing;
    const tag: TagDef = { id: newId(), kind, label: clean, createdAt: now };
    await db.tagDefs.add(tag);
    return tag;
  });
}

export const customRef = (tag: Pick<TagDef, 'id'>): CustomRef => `custom:${tag.id}`;
export const deleteTag = (db: TraczemaDB, id: ID) => db.tagDefs.delete(id);

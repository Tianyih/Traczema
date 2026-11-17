import { useCallback, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { createTag, customRef, listTags } from '@/db/repos/tagRepo';
import type { CustomRef, TagKind } from '@/db/types';
import { useDb } from './useDb';

/** User-created tags of one kind (diet / photo / activity). Labels are user text, never translated. */
export function useTags(kind: TagKind) {
  const { db } = useDb();
  const tags = useLiveQuery(() => listTags(db, kind), [db, kind]) ?? [];
  const sorted = useMemo(() => [...tags].sort((a, b) => a.createdAt - b.createdAt), [tags]);
  const labels = useMemo(() => new Map<CustomRef, string>(sorted.map((t) => [customRef(t), t.label])), [sorted]);
  const add = useCallback(async (label: string): Promise<CustomRef> => customRef(await createTag(db, kind, label)), [db, kind]);
  return { tags: sorted, refs: sorted.map(customRef), labels, add };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { emptyDailyLog } from '@/db/repos/dailyLogRepo';
import { deleteDay, loadDay, saveDay } from '@/db/repos/dayRepo';
import type { DailyLog, PhotoRecord } from '@/db/types';
import { ValidationError } from '@/db/validate';
import { useDb } from '@/hooks/useDb';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { isLogEmpty, sameLogContent } from '@/lib/dailyLogDraft';
import { addDaysISO, type ISODate } from '@/lib/date';
import { ImageError, processImageFile } from '@/lib/images/processImage';
import { Notice } from './fields';
import { BeddingSection } from './sections/BeddingSection';
import { ClothingSection } from './sections/ClothingSection';
import { DietSection } from './sections/DietSection';
import { ExerciseSection } from './sections/ExerciseSection';
import { NotesSection } from './sections/NotesSection';
import { PhotosSection } from './sections/PhotosSection';
import { SeveritySection } from './sections/SeveritySection';
import { ShowerSection } from './sections/ShowerSection';
import { StressSleepSection } from './sections/StressSleepSection';
import { WeatherSection } from './sections/WeatherSection';
import type { PhotoDraft, UpdateLog } from './types';

const photoSignature = (photos: readonly Pick<PhotoRecord, 'id' | 'tags' | 'caption'>[]) =>
  JSON.stringify(photos.map((p) => [p.id, p.tags, p.caption]));

type Confirm = { kind: 'discard'; then: () => void } | { kind: 'delete' } | null;

interface FormProps {
  date: ISODate;
  today: ISODate;
  initialLog: DailyLog | null;
  initialPhotos: PhotoRecord[];
  storedLogs: DailyLog[];
  onClose: () => void;
  onNavigate: (date: ISODate) => void;
  /** The form publishes its unsaved-changes-guarded close here so Esc / outside-click use it too. */
  closeRef: { current: (() => void) | null };
}

function DailyLogForm({ date, today, initialLog, initialPhotos, storedLogs, onClose, onNavigate, closeRef }: FormProps) {
  const { t, formatDate } = useLanguage();
  const { db } = useDb();

  const [log, setLog] = useState<DailyLog>(() => initialLog ?? emptyDailyLog(date));
  const baseline = useRef(log).current;
  const [photos, setPhotos] = useState<PhotoDraft[]>(() => initialPhotos.map((p) => ({ ...p, isNew: false })));
  const baselinePhotos = useRef(photoSignature(initialPhotos)).current;

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoError, setPhotoError] = useState<MessageKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const update: UpdateLog = useCallback((fn) => setLog((l) => fn(l)), []);
  const dirty = !sameLogContent(log, baseline) || photoSignature(photos) !== baselinePhotos;
  const hasStored = initialLog !== null || initialPhotos.length > 0;
  const nextDay = addDaysISO(date, 1);

  const guard = (action: () => void) => (dirty ? setConfirm({ kind: 'discard', then: action }) : action());
  useEffect(() => {
    closeRef.current = () => guard(onClose);
    return () => {
      closeRef.current = null;
    };
  });

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    setPhotoError(null);
    const added: PhotoDraft[] = [];
    for (const file of files) {
      try {
        const img = await processImageFile(file);
        added.push({
          id: crypto.randomUUID(), date, regionId: null, blob: img.blob, thumb: img.thumb, mime: img.mime,
          width: img.width, height: img.height, bytes: img.bytes, tags: [], caption: '', createdAt: Date.now() + added.length, isNew: true,
        });
      } catch (e) {
        setPhotoError(e instanceof ImageError ? (`photo_err_${e.code}` as MessageKey) : 'photo_err_unsupported');
      }
    }
    setPhotos((p) => [...p, ...added]);
    setBusy(false);
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const keep = new Set(photos.map((p) => p.id));
      await saveDay(db, {
        log,
        photos: photos.map(({ isNew: _isNew, ...rec }) => rec),
        removedPhotoIds: initialPhotos.filter((p) => !keep.has(p.id)).map((p) => p.id),
      });
      onClose();
    } catch (e) {
      setSaveError(e instanceof ValidationError ? e.message : e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await deleteDay(db, date);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const empty = isLogEmpty(log) && photos.length === 0;

  return (
    <>
      <div className="flex items-center gap-1 border-b px-3 py-3 pr-14">
        <Button variant="ghost" size="iconSm" aria-label={t('log_prev_day')} data-testid="log-prev" onClick={() => guard(() => onNavigate(addDaysISO(date, -1)))}>
          <ChevronLeft />
        </Button>
        <div className="min-w-0 flex-1 text-center">
          <SheetTitle data-testid="log-title" className="truncate text-base font-semibold">
            {formatDate(date, 'fmt_full_date')}
          </SheetTitle>
          <SheetDescription className="line-clamp-2 text-xs text-muted-foreground">{t('log_hint_optional')}</SheetDescription>
        </div>
        <Button variant="ghost" size="iconSm" aria-label={t('log_next_day')} data-testid="log-next" disabled={nextDay > today} onClick={() => guard(() => onNavigate(nextDay))}>
          <ChevronRight />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto bg-muted/40 px-4 py-4" data-testid="log-body">
        <PhotosSection
          photos={photos}
          busy={busy}
          errorKey={photoError}
          onAddFiles={(f) => void addFiles(f)}
          onChange={(id, patch) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))}
          onRemove={(id) => setPhotos((ps) => ps.filter((p) => p.id !== id))}
        />
        <NotesSection log={log} update={update} />
        <SeveritySection log={log} update={update} />
        <DietSection log={log} update={update} />
        <WeatherSection log={log} update={update} />
        <ExerciseSection log={log} update={update} />
        <ShowerSection log={log} update={update} />
        <ClothingSection log={log} update={update} />
        <BeddingSection log={log} update={update} storedLogs={storedLogs} />
        <StressSleepSection log={log} update={update} />
      </div>

      <footer className="space-y-2 border-t bg-card px-4 py-3">
        {saveError && <Notice tone="error" testId="log-error">{t('log_error_save', { message: saveError })}</Notice>}
        {confirm?.kind === 'discard' && (
          <div role="alertdialog" aria-label={t('log_discard_title')} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning px-3 py-2 text-sm text-warning-foreground">
            <span>{t('log_discard_title')}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>{t('log_keep_editing')}</Button>
              <Button size="sm" variant="destructive" data-testid="log-discard" onClick={() => { const next = confirm.then; setConfirm(null); next(); }}>{t('log_discard')}</Button>
            </span>
          </div>
        )}
        {confirm?.kind === 'delete' && (
          <div role="alertdialog" aria-label={t('log_delete_confirm')} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning px-3 py-2 text-sm text-warning-foreground">
            <span>{t('log_delete_confirm')}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>{t('log_cancel')}</Button>
              <Button size="sm" variant="destructive" data-testid="log-delete-yes" onClick={() => void remove()}>{t('log_delete_yes')}</Button>
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {hasStored && (
            <Button variant="ghost" className="text-destructive" data-testid="log-delete" onClick={() => setConfirm({ kind: 'delete' })} disabled={saving}>
              <Trash2 /> <span className="hidden sm:inline">{t('log_delete')}</span>
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground" data-testid="log-dirty">{dirty ? t('log_unsaved') : ''}</span>
          <Button variant="outline" onClick={() => guard(onClose)} disabled={saving}>{t('log_cancel')}</Button>
          <Button data-testid="log-save" onClick={() => void save()} disabled={saving || busy || (!dirty && !hasStored) || (empty && !hasStored)}>
            {saving && <Loader2 className="animate-spin" />} {saving ? t('log_saving') : t('log_save')}
          </Button>
        </div>
      </footer>
    </>
  );
}

export interface DailyLogDrawerProps {
  date: ISODate;
  today: ISODate;
  onClose: () => void;
  onNavigate: (date: ISODate) => void;
}

/** Drawer (right panel on desktop, bottom sheet on phones) for one day's entry. */
export function DailyLogDrawer({ date, today, onClose, onNavigate }: DailyLogDrawerProps) {
  const { t } = useLanguage();
  const { db } = useDb();
  // Results are tagged with the database and date they were read for; stale results from a previous
  // database / day (which useLiveQuery returns while re-querying) must never seed the form.
  const dayData = useLiveQuery(async () => ({ dbName: db.name, date, ...(await loadDay(db, date)) }), [db, date]);
  const history = useLiveQuery(async () => ({ dbName: db.name, logs: await db.dailyLogs.toArray() }), [db]);
  const ready = dayData !== undefined && dayData.dbName === db.name && dayData.date === date && history !== undefined && history.dbName === db.name;

  // Close requests (Esc / click outside / X) are routed through the form's unsaved-changes guard.
  const requestClose = useRef<(() => void) | null>(null);
  const formKey = useMemo(() => `${db.name}:${date}`, [db, date]);

  return (
    <Sheet open onOpenChange={(open) => !open && (requestClose.current ? requestClose.current() : onClose())}>
      <SheetContent
        closeLabel={t('log_close')}
        data-testid="daily-log-drawer"
        aria-describedby={undefined}
        // The calendar page returns focus to the day cell itself; Radix's own restore runs later and lands on <body>.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {ready ? (
          <DailyLogForm
            key={formKey}
            closeRef={requestClose}
            date={date} today={today} initialLog={dayData.log} initialPhotos={dayData.photos} storedLogs={history.logs} onClose={onClose} onNavigate={onNavigate}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <SheetTitle className="sr-only">{t('log_title')}</SheetTitle>
            <Loader2 className="size-4 animate-spin" /> {t('log_loading')}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

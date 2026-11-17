import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { deleteObservation, saveObservation } from '@/db/repos/regionRepo';
import { LESION_STATUSES, RESIDUAL_SKIN_STATES, type BodyPartLog, type LesionStatus, type PhotoRecord, type RegionId } from '@/db/types';
import { ValidationError } from '@/db/validate';
import { useDb } from '@/hooks/useDb';
import { usePhotoDrafts } from '@/hooks/usePhotoDrafts';
import { useLanguage } from '@/i18n/LanguageContext';
import { isISODate, type ISODate } from '@/lib/date';
import { initialDraft, observationOn, toggleResidual, unusualTransition, withStatus, type ObservationDraft } from '@/lib/regionObservation';
import { PhotosSection } from '@/components/daily-log/sections/PhotosSection';
import { Chip, FieldLabel, Notice, Section, Segmented, SliderField } from '@/components/daily-log/fields';
import { Input } from '@/components/ui/input';

export interface ObservationFormProps {
  regionId: RegionId;
  date: ISODate;
  today: ISODate;
  /** This region's observations and that day's photos, read fresh at mount (never from a live query). */
  logs: readonly BodyPartLog[];
  photos: readonly PhotoRecord[];
  onDateChange: (date: ISODate) => void;
  /** Called after the observation was deleted so the parent can reload a clean form. */
  onDeleted: () => void;
}

type Confirm = { kind: 'delete' } | { kind: 'date'; to: ISODate } | null;

export function ObservationForm({ regionId, date, today, logs, photos: initialPhotos, onDateChange, onDeleted }: ObservationFormProps) {
  const { t } = useLanguage();
  const { db } = useDb();

  const existing = observationOn(logs, regionId, date);
  const [storedId, setStoredId] = useState<string | null>(existing?.id ?? null);
  const [draft, setDraft] = useState<ObservationDraft>(() => initialDraft(logs, regionId, date));
  const [baseline, setBaseline] = useState(draft);
  const pics = usePhotoDrafts({ date, regionId, initial: [...initialPhotos] });

  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<'saved' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline) || pics.dirty;
  const resolved = draft.status === 'healing' || draft.status === 'healed';
  const hasSeverity = draft.status === 'active' || draft.status === 'healing';
  const unusual = unusualTransition(logs, regionId, date, draft.status);
  const isFirst = existing === null && !logs.some((l) => l.date < date);

  const set = (patch: Partial<ObservationDraft>) => {
    setNotice(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const requestDate = (value: string) => {
    if (!isISODate(value) || value > today || value === date) return;
    if (dirty) setConfirm({ kind: 'date', to: value });
    else onDateChange(value);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const row = await saveObservation(db, {
        log: { regionId, date, status: draft.status, severity: draft.severity, residualSkin: draft.residualSkin, notes: draft.notes.trim() },
        photos: pics.toRecords(),
        removedPhotoIds: pics.removedIds,
      });
      setStoredId(row.id);
      setBaseline(draft);
      pics.markSaved();
      setNotice('saved');
    } catch (e) {
      setError(e instanceof ValidationError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!storedId) return;
    setSaving(true);
    try {
      await deleteObservation(db, storedId);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="observation-form">
      <Section title={storedId ? t('obs_form_edit') : t('obs_form_new')}>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <FieldLabel htmlFor="obs-date">{t('obs_field_date')}</FieldLabel>
            <Input id="obs-date" data-testid="obs-date" type="date" max={today} value={date} onChange={(e) => requestDate(e.target.value)} />
          </div>
          {date !== today && (
            <Button variant="outline" data-testid="obs-new" onClick={() => requestDate(today)}>
              <Plus /> {t('obs_new')}
            </Button>
          )}
        </div>

        <div>
          <FieldLabel>{t('obs_field_status')}</FieldLabel>
          <Segmented<LesionStatus>
            testId="obs-status"
            ariaLabel={t('obs_field_status')}
            value={draft.status}
            onChange={(s) => {
              if (!s) return;
              setNotice(null);
              setDraft((d) => withStatus(d, s));
            }}
            options={LESION_STATUSES.map((s) => ({ value: s, label: t(`status_${s}`) }))}
          />
          {unusual && (
            <p data-testid="obs-unusual" className="mt-2 rounded-md bg-warning px-3 py-2 text-xs text-warning-foreground">
              {t('obs_unusual_transition', { from: t(`status_${unusual.from}`), to: t(`status_${unusual.to}`) })}
            </p>
          )}
          {isFirst && !unusual && <p className="mt-2 text-xs text-muted-foreground">{t('obs_first_hint')}</p>}
        </div>

        {hasSeverity ? (
          <SliderField testId="obs-severity" heat clearable={false} label={t('obs_field_severity')} min={draft.status === 'active' ? 1 : 0} max={10} value={draft.severity} onChange={(v) => v !== null && set({ severity: v })} />
        ) : (
          <p className="text-xs text-muted-foreground">{t('obs_severity_zero')}</p>
        )}

        {resolved && (
          <div data-testid="obs-skin">
            <FieldLabel>{t('obs_field_skin')}</FieldLabel>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('obs_field_skin')}>
              {RESIDUAL_SKIN_STATES.map((s) => (
                <Chip key={s} testId={`skin-${s}`} selected={draft.residualSkin.includes(s)} onClick={() => set({ residualSkin: toggleResidual(draft.residualSkin, s) })}>
                  {t(`skin_${s}`)}
                </Chip>
              ))}
            </div>
          </div>
        )}

        <div>
          <FieldLabel htmlFor="obs-notes">{t('obs_field_notes')}</FieldLabel>
          <Textarea id="obs-notes" data-testid="obs-notes" className="min-h-20" placeholder={t('obs_notes_placeholder')} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} />
        </div>
      </Section>

      <PhotosSection photos={pics.photos} busy={pics.busy} errorKey={pics.errorKey} onAddFiles={(f) => void pics.addFiles(f)} onChange={pics.patch} onRemove={pics.remove} />

      <div className="space-y-2">
        {error && <Notice tone="error" testId="obs-error">{t('obs_error', { message: error })}</Notice>}
        {notice === 'saved' && <Notice tone="success" testId="obs-saved">{t('obs_saved')}</Notice>}
        {confirm?.kind === 'delete' && (
          <div role="alertdialog" aria-label={t('obs_delete_confirm')} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning px-3 py-2 text-sm text-warning-foreground">
            <span>{t('obs_delete_confirm')}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>{t('obs_cancel')}</Button>
              <Button size="sm" variant="destructive" data-testid="obs-delete-yes" onClick={() => void remove()}>{t('obs_delete_yes')}</Button>
            </span>
          </div>
        )}
        {confirm?.kind === 'date' && (
          <div role="alertdialog" aria-label={t('log_discard_title')} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning px-3 py-2 text-sm text-warning-foreground">
            <span>{t('log_discard_title')}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setConfirm(null)}>{t('log_keep_editing')}</Button>
              <Button size="sm" variant="destructive" data-testid="obs-discard" onClick={() => { const to = confirm.to; setConfirm(null); onDateChange(to); }}>{t('log_discard')}</Button>
            </span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {storedId && (
            <Button variant="ghost" className="text-destructive" data-testid="obs-delete" disabled={saving} onClick={() => setConfirm({ kind: 'delete' })}>
              <Trash2 /> <span className="hidden sm:inline">{t('obs_delete')}</span>
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground" data-testid="obs-dirty">{dirty ? t('log_unsaved') : ''}</span>
          <Button data-testid="obs-save" disabled={saving || pics.busy || (!dirty && storedId !== null)} onClick={() => void save()}>
            {saving && <Loader2 className="animate-spin" />} {saving ? t('obs_saving') : t('obs_save')}
          </Button>
        </div>
      </div>
    </div>
  );
}

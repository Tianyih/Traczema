import type { LesionStatus, RegionId } from '@/db/types';
import { REGION_IDS } from '@/db/types';

export type BodyView = 'anterior' | 'posterior';
export type RegionGroup = 'head_neck' | 'trunk' | 'upper_limb' | 'lower_limb';

/** Structural metadata only. Display names come from i18n (`region_<id>`). */
export interface RegionMeta {
  id: RegionId;
  views: readonly BodyView[];
  group: RegionGroup;
  /** Skin-fold sites where atopic eczema classically localises. */
  flexural: boolean;
}

export const REGION_META: Record<RegionId, RegionMeta> = {
  scalp: { id: 'scalp', views: ['anterior', 'posterior'], group: 'head_neck', flexural: false },
  face: { id: 'face', views: ['anterior'], group: 'head_neck', flexural: false },
  neck: { id: 'neck', views: ['anterior', 'posterior'], group: 'head_neck', flexural: false },
  chest: { id: 'chest', views: ['anterior'], group: 'trunk', flexural: false },
  back: { id: 'back', views: ['posterior'], group: 'trunk', flexural: false },
  upper_arms: { id: 'upper_arms', views: ['anterior', 'posterior'], group: 'upper_limb', flexural: false },
  antecubital_fossa: { id: 'antecubital_fossa', views: ['anterior'], group: 'upper_limb', flexural: true },
  forearms: { id: 'forearms', views: ['anterior', 'posterior'], group: 'upper_limb', flexural: false },
  hands_wrists: { id: 'hands_wrists', views: ['anterior', 'posterior'], group: 'upper_limb', flexural: false },
  abdomen: { id: 'abdomen', views: ['anterior'], group: 'trunk', flexural: false },
  groin: { id: 'groin', views: ['anterior'], group: 'trunk', flexural: true },
  thighs: { id: 'thighs', views: ['anterior', 'posterior'], group: 'lower_limb', flexural: false },
  popliteal_fossa: { id: 'popliteal_fossa', views: ['posterior'], group: 'lower_limb', flexural: true },
  lower_legs: { id: 'lower_legs', views: ['anterior', 'posterior'], group: 'lower_limb', flexural: false },
  feet_ankles: { id: 'feet_ankles', views: ['anterior', 'posterior'], group: 'lower_limb', flexural: false },
};

export const ALL_REGIONS: readonly RegionMeta[] = REGION_IDS.map((id) => REGION_META[id]);

/**
 * Transitions the UI offers from a given previous status. The derivation engine itself is total
 * (it accepts any sequence); this table only drives which options are shown without a warning.
 */
export const STATUS_TRANSITIONS: Record<LesionStatus, readonly LesionStatus[]> = {
  clear: ['clear', 'active'],
  active: ['active', 'healing', 'healed'],
  healing: ['healing', 'active', 'healed'],
  healed: ['healed', 'clear', 'active'],
};

export const isUsualTransition = (from: LesionStatus, to: LesionStatus): boolean =>
  STATUS_TRANSITIONS[from].includes(to);

/** An episode is "open" while the region is in one of these statuses. */
export const isAffectedStatus = (s: LesionStatus): boolean => s === 'active' || s === 'healing';

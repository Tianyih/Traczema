/**
 * Compile-time guarantee that every canonical id stored in IndexedDB or emitted by the engine has
 * a translation. Add an enum value (e.g. a new region) without adding `region_<id>` to `en.ts`
 * and `npm run typecheck` fails here.
 */
import type {
  Activity,
  ClothingTag,
  CleansingLevel,
  LesionStatus,
  PhotoTag,
  PresetDietTag,
  RegionId,
  ResidualSkin,
  SweatLevel,
  WaterTemp,
} from '@/db/types';
import type { LagId, SeverityTier, Unit, VariableGroup, VariableId } from '@/lib/analytics/types';
import type { MessageKey } from './index';

export type CanonicalMessageKey =
  | `diet_${PresetDietTag}`
  | `sweat_${SweatLevel}`
  | `watertemp_${WaterTemp}`
  | 'watertemp_no_shower'
  | `cleansing_${CleansingLevel}`
  | `clothing_${ClothingTag}`
  | `activity_${Activity}`
  | `region_${RegionId}`
  | `status_${LesionStatus}`
  | `skin_${ResidualSkin}`
  | `phototag_${PhotoTag}`
  | `var_${VariableId}`
  | 'var_composite'
  | 'var_severity'
  | 'var_itch'
  | `group_${VariableGroup}`
  | `lag_${LagId}`
  | `tier_${SeverityTier}`
  | `unit_${Unit}`;

type AssertTrue<T extends true> = T;
/** Fails to compile if any canonical key is missing from `en`. */
export type EveryCanonicalKeyIsTranslated = AssertTrue<CanonicalMessageKey extends MessageKey ? true : false>;

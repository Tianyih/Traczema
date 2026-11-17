/**
 * Stored (raw-input) data model.
 *
 * RULES
 *  - Everything here is a language-agnostic canonical key or a number. Display labels are
 *    resolved in the UI layer through `t()` using the key convention `<field>_<value>`
 *    (e.g. sweat 'heavy' -> `sweat_heavy`). User-authored text (notes, captions, custom tag
 *    labels) is stored verbatim and is never translated.
 *  - Derived temporal fields (days since bedding wash, days affected, isRecurrence) are NEVER
 *    stored; they are computed in `src/lib/derive/`.
 *  - `null` means "not recorded" and is excluded from analysis (never coerced to 0 / "none").
 */
import type { ISODate } from '@/lib/date';

export type { ISODate };
export type ID = string;

export const SWEAT_LEVELS = ['none', 'light', 'moderate', 'heavy'] as const;
export const WATER_TEMPS = ['cool', 'lukewarm', 'warm', 'hot'] as const; // <27 | 27–32 | 33–37 | >37 °C
export const CLEANSING_LEVELS = ['water_only', 'gentle_hand', 'moderate', 'vigorous'] as const;
export const CLOTHING_TAGS = [
  'cotton',
  'silk',
  'wool',
  'synthetic',
  'tight_friction',
  'loose_breathable',
] as const;
export const PRESET_DIET_TAGS = [
  'dairy',
  'eggs',
  'seafood',
  'nuts',
  'soy',
  'wheat_gluten',
  'spicy',
  'alcohol',
  'high_sugar',
] as const;
export const ACTIVITIES = [
  'running',
  'walking',
  'cycling',
  'swimming',
  'gym',
  'yoga',
  'team_sports',
  'other',
] as const;
export const PHOTO_TAGS = ['before', 'after', 'flare', 'healing', 'closeup', 'overview'] as const;
export const LESION_STATUSES = ['clear', 'active', 'healing', 'healed'] as const;
export const RESIDUAL_SKIN_STATES = [
  'normal_skin',
  'hyperpigmentation',
  'hypopigmentation',
  'lichenification',
  'xerosis',
] as const;
export const REGION_IDS = [
  'scalp',
  'face',
  'neck',
  'chest',
  'back',
  'upper_arms',
  'antecubital_fossa',
  'forearms',
  'hands_wrists',
  'abdomen',
  'groin',
  'thighs',
  'popliteal_fossa',
  'lower_legs',
  'feet_ankles',
] as const;

export type SweatLevel = (typeof SWEAT_LEVELS)[number];
export type WaterTemp = (typeof WATER_TEMPS)[number];
export type CleansingLevel = (typeof CLEANSING_LEVELS)[number];
export type ClothingTag = (typeof CLOTHING_TAGS)[number];
export type PresetDietTag = (typeof PRESET_DIET_TAGS)[number];
export type Activity = (typeof ACTIVITIES)[number];
export type PhotoTag = (typeof PHOTO_TAGS)[number];
export type LesionStatus = (typeof LESION_STATUSES)[number];
export type ResidualSkin = (typeof RESIDUAL_SKIN_STATES)[number];
export type RegionId = (typeof REGION_IDS)[number];

/** Reference to a user-created tag: the label lives in `TagDef` and is user text. */
export type CustomRef = `custom:${string}`;
export type DietTagRef = PresetDietTag | CustomRef;
export type ActivityRef = Activity | CustomRef;
export type PhotoTagRef = PhotoTag | CustomRef;

export const isCustomRef = (v: string): v is CustomRef => v.startsWith('custom:');

export interface WeatherInput {
  temperatureC: number | null;
  humidityPct: number | null;
  /** Provenance, so a manual override is never silently replaced by an auto-fill. */
  source: 'manual' | 'open-meteo';
  fetchedAt: number | null;
}

export interface ExerciseInput {
  durationMin: number | null;
  activity: ActivityRef | null;
  sweat: SweatLevel | null;
}

export interface ShowerInput {
  /** false = explicitly no shower today. */
  took: boolean;
  durationMin: number | null;
  waterTemp: WaterTemp | null;
  cleansing: CleansingLevel | null;
  /** Moisturiser applied within 3 minutes of bathing. */
  moisturizedWithin3Min: boolean | null;
}

export interface BeddingInput {
  /** "Washed/changed bed sheets & duvet cover today". */
  washedToday: boolean;
  /**
   * Manual anchor used only when no explicit wash precedes this log. The UI asks for
   * "N days ago" and stores `date − N`, so no calculated day-count is ever stored.
   */
  assumedLastWashDate: ISODate | null;
}

export interface SleepInput {
  hours: number | null; // 0.5 steps
  quality: number | null; // 1–5
}

/** One row per calendar day. Primary key: `date`. */
export interface DailyLog {
  date: ISODate;
  overallSeverity: number | null; // int 0–10
  itchIntensity: number | null; // int 0–10
  notes: string; // user text, markdown-lite
  dietTags: DietTagRef[] | null; // [] = explicitly none
  weather: WeatherInput | null;
  exercise: ExerciseInput | null;
  shower: ShowerInput | null;
  clothing: ClothingTag[] | null;
  bedding: BeddingInput | null;
  stressLevel: number | null; // int 1–10
  sleep: SleepInput | null;
  createdAt: number;
  updatedAt: number;
}

/** One observation per (region, date). The lifecycle/episodes are derived from the sequence. */
export interface BodyPartLog {
  id: ID;
  regionId: RegionId;
  date: ISODate;
  status: LesionStatus;
  /** 0–10. Forced to 0 for `clear` / `healed`. */
  severity: number;
  /** Only meaningful for `healing` / `healed`. `normal_skin` is exclusive. */
  residualSkin: ResidualSkin[];
  notes: string; // user text
  createdAt: number;
  updatedAt: number;
}

export interface PhotoRecord {
  id: ID;
  date: ISODate;
  /** null = whole-day photo (not tied to a body part). */
  regionId: RegionId | null;
  blob: Blob;
  thumb: Blob;
  mime: string;
  width: number;
  height: number;
  bytes: number;
  tags: PhotoTagRef[];
  caption: string; // user text
  createdAt: number;
}

export type TagKind = 'diet' | 'photo' | 'activity';

/** A user-created tag. `label` is user text and is displayed as-is in every language. */
export interface TagDef {
  id: ID;
  kind: TagKind;
  label: string;
  createdAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

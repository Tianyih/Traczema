/**
 * Hand-authored, stylised body silhouettes (front and back). Pure data: no React.
 *
 * Coordinates are absolute (commands M L C Z only) in a 220 x 480 space with the body centred on
 * x = 110. Side regions are authored once for the viewer's RIGHT half and drawn a second time with a
 * horizontal mirror, so both limbs map to the same (bilateral) region id.
 *
 * Which regions exist in which view follows REGION_META.views (a test keeps the two in sync):
 *   front: scalp, face, neck, chest, abdomen, groin, upper arms, antecubital fossae, forearms,
 *          hands/wrists, thighs, lower legs, feet/ankles
 *   back:  scalp, neck, back, upper arms, forearms, hands/wrists, thighs, popliteal fossae,
 *          lower legs, feet/ankles
 */
import type { RegionId } from '@/db/types';
import type { BodyView } from '@/lib/regions';

/** The coordinate space shapes are authored in (body centred on x = 110). */
export const COORD_SPACE = { width: 220, height: 480 } as const;
/**
 * What is actually shown: the body only spans x 41..179, so the empty margins are cropped. This makes
 * every region ~1.5x larger on screen, which keeps small targets (neck, elbow creases) tappable.
 */
export const VIEWBOX = { x: 36, y: 0, width: 148, height: 480 } as const;
export const MIRROR_TRANSFORM = `translate(${COORD_SPACE.width} 0) scale(-1 1)`;

export interface RegionShape {
  region: RegionId;
  /** Right-half geometry when `mirrored`, otherwise the full (centred) shape. */
  d: string;
  /** Draw a second, horizontally mirrored copy (left limb). */
  mirrored: boolean;
}

export interface SilhouettePart {
  id: string;
  d: string;
  mirrored: boolean;
}

// ---- shared pieces ---------------------------------------------------------------------------
const NECK = 'M 100 58 L 120 58 L 123 78 L 97 78 Z';
const UPPER_ARM = 'M 153 90 C 167 88 179 95 179 109 L 175 152 L 155 152 C 154 130 154 108 153 90 Z';
const HAND = 'M 159 240 L 169 240 C 174 262 175 278 171 292 C 167 300 159 300 157 292 C 155 276 157 256 159 240 Z';

const FRONT_SHAPES: RegionShape[] = [
  { region: 'scalp', mirrored: false, d: 'M 89 30 C 89 16 98 8 110 8 C 122 8 131 16 131 30 C 126 24 118 20 110 20 C 102 20 94 24 89 30 Z' },
  { region: 'face', mirrored: false, d: 'M 89 30 C 94 24 102 20 110 20 C 118 20 126 24 131 30 C 131 46 122 60 110 60 C 98 60 89 46 89 30 Z' },
  { region: 'neck', mirrored: false, d: NECK },
  { region: 'chest', mirrored: false, d: 'M 97 78 L 123 78 C 137 79 148 83 151 94 L 147 142 L 73 142 L 69 94 C 72 83 83 79 97 78 Z' },
  { region: 'abdomen', mirrored: false, d: 'M 73 142 L 147 142 C 146 164 143 182 141 200 L 79 200 C 77 182 74 164 73 142 Z' },
  { region: 'groin', mirrored: false, d: 'M 79 200 L 141 200 C 141 216 128 228 110 240 C 92 228 79 216 79 200 Z' },
  { region: 'upper_arms', mirrored: true, d: UPPER_ARM },
  { region: 'antecubital_fossa', mirrored: true, d: 'M 155 152 L 175 152 L 173 174 L 157 174 Z' },
  { region: 'forearms', mirrored: true, d: 'M 157 174 L 173 174 L 169 240 L 159 240 Z' },
  { region: 'hands_wrists', mirrored: true, d: HAND },
  { region: 'thighs', mirrored: true, d: 'M 141 202 C 148 250 146 302 139 334 L 115 334 C 113 300 112 270 112 240 C 128 228 141 216 141 202 Z' },
  { region: 'lower_legs', mirrored: true, d: 'M 115 336 L 139 336 C 141 372 139 402 135 432 L 120 432 C 116 402 114 372 115 336 Z' },
  { region: 'feet_ankles', mirrored: true, d: 'M 120 434 L 135 434 C 137 452 140 462 146 468 C 146 476 124 478 116 472 C 116 458 118 444 120 434 Z' },
];

const BACK_SHAPES: RegionShape[] = [
  { region: 'scalp', mirrored: false, d: 'M 89 34 C 89 18 98 8 110 8 C 122 8 131 18 131 34 C 131 48 122 60 110 60 C 98 60 89 48 89 34 Z' },
  { region: 'neck', mirrored: false, d: NECK },
  { region: 'back', mirrored: false, d: 'M 97 78 L 123 78 C 137 79 148 83 151 94 L 147 142 C 146 164 143 182 141 200 L 79 200 C 77 182 74 164 73 142 L 69 94 C 72 83 83 79 97 78 Z' },
  { region: 'upper_arms', mirrored: true, d: UPPER_ARM },
  // No antecubital region on the back: the forearm starts at the elbow.
  { region: 'forearms', mirrored: true, d: 'M 155 152 L 175 152 L 171 240 L 159 240 Z' },
  { region: 'hands_wrists', mirrored: true, d: HAND },
  { region: 'thighs', mirrored: true, d: 'M 113 238 L 138 232 C 147 262 146 296 140 322 L 116 322 C 113 292 112 266 113 238 Z' },
  { region: 'popliteal_fossa', mirrored: true, d: 'M 116 322 L 140 322 L 138 350 L 117 350 Z' },
  { region: 'lower_legs', mirrored: true, d: 'M 117 352 L 138 352 C 140 384 138 408 135 432 L 120 432 C 117 408 116 384 117 352 Z' },
  { region: 'feet_ankles', mirrored: true, d: 'M 120 434 L 135 434 C 137 452 137 462 134 468 C 130 474 124 474 121 468 C 118 460 118 446 120 434 Z' },
];

/** Not a tracked region (the spec has none for the buttocks): drawn as neutral, non-interactive anatomy. */
const BACK_SILHOUETTE: SilhouettePart[] = [
  { id: 'gluteal', mirrored: false, d: 'M 79 200 L 141 200 C 143 214 141 226 138 232 L 110 240 L 82 232 C 79 226 77 214 79 200 Z' },
];

export const BODY_SHAPES: Record<BodyView, { shapes: RegionShape[]; silhouette: SilhouettePart[] }> = {
  anterior: { shapes: FRONT_SHAPES, silhouette: [] },
  posterior: { shapes: BACK_SHAPES, silhouette: BACK_SILHOUETTE },
};

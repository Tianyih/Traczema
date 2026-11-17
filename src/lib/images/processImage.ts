/**
 * Browser-only photo pipeline. Photos are decoded, auto-rotated, downscaled and RE-ENCODED as JPEG,
 * which (a) keeps IndexedDB small and (b) strips EXIF metadata such as GPS location.
 */
import { fitWithin } from './fit';

export const MAX_DIMENSION = 1600;
export const THUMB_DIMENSION = 320;
export const JPEG_QUALITY = 0.85;
export const MAX_INPUT_BYTES = 30 * 1024 * 1024;

export type ImageErrorCode = 'unsupported' | 'too_large' | 'encode_failed';
export class ImageError extends Error {
  constructor(public readonly code: ImageErrorCode) {
    super(code);
    this.name = 'ImageError';
  }
}

export interface ProcessedImage {
  blob: Blob;
  thumb: Blob;
  mime: 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
}

function encode(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new ImageError('encode_failed'));
  ctx.fillStyle = '#fff'; // JPEG has no alpha: flatten transparent PNGs onto white
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageError('encode_failed'))), 'image/jpeg', JPEG_QUALITY),
  );
}

export async function processImageFile(file: File): Promise<ProcessedImage> {
  if (!file.type.startsWith('image/')) throw new ImageError('unsupported');
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('too_large');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageError('unsupported'); // e.g. HEIC in a browser that cannot decode it
  }
  try {
    const full = fitWithin(bitmap.width, bitmap.height, MAX_DIMENSION);
    const small = fitWithin(bitmap.width, bitmap.height, THUMB_DIMENSION);
    const [blob, thumb] = await Promise.all([encode(bitmap, full.width, full.height), encode(bitmap, small.width, small.height)]);
    return { blob, thumb, mime: 'image/jpeg', width: full.width, height: full.height, bytes: blob.size };
  } finally {
    bitmap.close();
  }
}

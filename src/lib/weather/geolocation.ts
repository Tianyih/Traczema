import { roundCoords, type Coords } from './openMeteo';

export type GeoErrorCode = 'geo_unsupported' | 'geo_denied' | 'geo_unavailable';

export class GeoError extends Error {
  constructor(public readonly code: GeoErrorCode) {
    super(code);
    this.name = 'GeoError';
  }
}

/** One-shot browser geolocation, already rounded to ~1 km so a precise position never leaves the page. */
export function getCurrentCoords(timeoutMs = 10_000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new GeoError('geo_unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(roundCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })),
      (err) => reject(new GeoError(err.code === err.PERMISSION_DENIED ? 'geo_denied' : 'geo_unavailable')),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60_000 },
    );
  });
}

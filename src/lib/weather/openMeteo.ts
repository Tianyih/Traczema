/**
 * Open-Meteo client (free, no API key). Used only when the user presses "Auto-fill local weather".
 *
 * Privacy: sends the location rounded to 2 decimals (~1 km) and the date; nothing is stored.
 *
 * Endpoints (verified against the live API):
 *  - archive  https://archive-api.open-meteo.com/v1/archive  — served complete days up to yesterday
 *  - forecast https://api.open-meteo.com/v1/forecast         — needed for today
 * Both return `hourly.time` (local ISO strings), `hourly.temperature_2m` (°C) and
 * `hourly.relative_humidity_2m` (%). The daily value is the mean of the day's hourly values.
 * The free tier is rate limited (HTTP 429 / `{error:true, reason:"...limit..."}`).
 */
import { diffDays, type ISODate } from '../date';

export interface Coords {
  latitude: number;
  longitude: number;
}

export interface DailyWeather {
  temperatureC: number | null;
  humidityPct: number | null;
}

export type WeatherErrorCode = 'rate_limited' | 'network' | 'no_data' | 'bad_response';

export class WeatherError extends Error {
  constructor(public readonly code: WeatherErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'WeatherError';
  }
}

export const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
/** A daily mean needs at least this many hourly readings to be trusted. */
export const MIN_HOURS = 12;

export const roundCoords = (c: Coords): Coords => ({
  latitude: Math.round(c.latitude * 100) / 100,
  longitude: Math.round(c.longitude * 100) / 100,
});

export function buildWeatherUrl(kind: 'archive' | 'forecast', coords: Coords, date: ISODate): string {
  const { latitude, longitude } = roundCoords(coords);
  const q = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: date,
    end_date: date,
    hourly: 'temperature_2m,relative_humidity_2m',
    timezone: 'auto',
  });
  return `${kind === 'archive' ? ARCHIVE_URL : FORECAST_URL}?${q.toString()}`;
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Pull the day's mean temperature / humidity out of an Open-Meteo response. */
export function parseHourly(json: unknown, date: ISODate): DailyWeather {
  if (typeof json !== 'object' || json === null) throw new WeatherError('bad_response');
  const body = json as { error?: unknown; reason?: unknown; hourly?: unknown };
  if (body.error) {
    const reason = typeof body.reason === 'string' ? body.reason : '';
    throw new WeatherError(/limit/i.test(reason) ? 'rate_limited' : 'bad_response', reason);
  }
  const hourly = body.hourly as { time?: unknown; temperature_2m?: unknown; relative_humidity_2m?: unknown } | undefined;
  if (!hourly || !Array.isArray(hourly.time)) throw new WeatherError('bad_response');

  const temps: number[] = [];
  const hums: number[] = [];
  hourly.time.forEach((t, i) => {
    if (typeof t !== 'string' || !t.startsWith(date)) return; // keep only the requested local day
    const temp = (hourly.temperature_2m as unknown[] | undefined)?.[i];
    const hum = (hourly.relative_humidity_2m as unknown[] | undefined)?.[i];
    if (typeof temp === 'number' && Number.isFinite(temp)) temps.push(temp);
    if (typeof hum === 'number' && Number.isFinite(hum)) hums.push(hum);
  });

  const temperatureC = temps.length >= MIN_HOURS ? Math.round(mean(temps) * 10) / 10 : null;
  const humidityPct = hums.length >= MIN_HOURS ? Math.round(mean(hums)) : null;
  if (temperatureC === null && humidityPct === null) throw new WeatherError('no_data');
  return { temperatureC, humidityPct };
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

async function fetchOne(kind: 'archive' | 'forecast', coords: Coords, date: ISODate, fetchImpl: FetchLike, signal?: AbortSignal): Promise<DailyWeather> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(buildWeatherUrl(kind, coords, date), { signal });
  } catch {
    throw new WeatherError('network');
  }
  if (res.status === 429) throw new WeatherError('rate_limited');
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new WeatherError(res.ok ? 'bad_response' : 'network');
  }
  if (!res.ok && (typeof json !== 'object' || json === null || !(json as { error?: unknown }).error)) {
    throw new WeatherError('network');
  }
  return parseHourly(json, date);
}

/**
 * Past days come from the archive (falling back to the forecast service if the archive has gaps);
 * today can only come from the forecast service (for today it is the forecast daily mean).
 */
export async function fetchDailyWeather(
  coords: Coords,
  date: ISODate,
  today: ISODate,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
  signal?: AbortSignal,
): Promise<DailyWeather> {
  if (diffDays(date, today) > 0) throw new WeatherError('no_data', 'future dates are not supported');
  if (diffDays(today, date) === 0) return fetchOne('forecast', coords, date, fetchImpl, signal);
  try {
    return await fetchOne('archive', coords, date, fetchImpl, signal);
  } catch (e) {
    if (e instanceof WeatherError && (e.code === 'no_data' || e.code === 'bad_response')) {
      return fetchOne('forecast', coords, date, fetchImpl, signal);
    }
    throw e;
  }
}

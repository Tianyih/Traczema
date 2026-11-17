import { describe, expect, it, vi } from 'vitest';
import { buildWeatherUrl, fetchDailyWeather, parseHourly, roundCoords, WeatherError } from './openMeteo';
import { d } from '@/test/factories';

/** A response shaped exactly like the live archive API (captured 2026-11-17 for London, 2026-06-10). */
const hours = (date: string) => Array.from({ length: 24 }, (_, h) => `${date}T${String(h).padStart(2, '0')}:00`);
const live = (date: string, temps: (number | null)[], hums: (number | null)[]) => ({
  latitude: 51.5, longitude: -0.13, utc_offset_seconds: 0, timezone: 'Europe/London',
  hourly_units: { time: 'iso8601', temperature_2m: '°C', relative_humidity_2m: '%' },
  hourly: { time: hours(date), temperature_2m: temps, relative_humidity_2m: hums },
});
const ramp = (a: number, b: number) => Array.from({ length: 24 }, (_, i) => a + ((b - a) * i) / 23);
const ok = (json: unknown, status = 200) => ({ ok: status < 400, status, json: async () => json });

describe('URL building', () => {
  it('rounds coordinates to 2 decimals (~1 km) and asks for hourly temp + humidity in local time', () => {
    expect(roundCoords({ latitude: 51.507351, longitude: -0.127758 })).toEqual({ latitude: 51.51, longitude: -0.13 });
    const url = new URL(buildWeatherUrl('archive', { latitude: 51.507351, longitude: -0.127758 }, d('2024-05-01')));
    expect(url.origin + url.pathname).toBe('https://archive-api.open-meteo.com/v1/archive');
    expect(url.searchParams.get('latitude')).toBe('51.51');
    expect(url.searchParams.get('longitude')).toBe('-0.13');
    expect(url.searchParams.get('start_date')).toBe('2024-05-01');
    expect(url.searchParams.get('end_date')).toBe('2024-05-01');
    expect(url.searchParams.get('hourly')).toBe('temperature_2m,relative_humidity_2m');
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(buildWeatherUrl('forecast', { latitude: 0, longitude: 0 }, d('2024-05-01'))).toContain('https://api.open-meteo.com/v1/forecast?');
  });

  it('never leaks more precision than 2 decimals', () => {
    const url = buildWeatherUrl('archive', { latitude: 12.3456789, longitude: 98.7654321 }, d('2024-05-01'));
    expect(url).not.toMatch(/12\.3456|98\.7654/);
  });
});

describe('parseHourly', () => {
  it('averages the 24 hourly values: temperature to 0.1 °C, humidity to an integer', () => {
    const r = parseHourly(live('2024-05-01', ramp(10, 20), ramp(60, 80)), d('2024-05-01'));
    expect(r).toEqual({ temperatureC: 15, humidityPct: 70 });
  });

  it('ignores hours that belong to other days (a response can include neighbouring dates)', () => {
    // First 12 hours are on May 1 (10 °C flat); the other 12 are labelled May 2 and read 100 °C.
    const json = live('2024-05-01', [...Array(12).fill(10), ...Array(12).fill(100)], Array(24).fill(50));
    json.hourly.time = json.hourly.time.map((t, i) => (i < 12 ? t : t.replace('05-01', '05-02')));
    expect(parseHourly(json, d('2024-05-01'))).toEqual({ temperatureC: 10, humidityPct: 50 }); // not polluted by 100s
    // With only 11 hours left on the requested day there is not enough data to trust a mean.
    const short = live('2024-05-01', Array(24).fill(10), Array(24).fill(50));
    short.hourly.time = short.hourly.time.map((t, i) => (i < 11 ? t : t.replace('05-01', '05-02')));
    expect(() => parseHourly(short, d('2024-05-01'))).toThrowError(expect.objectContaining({ code: 'no_data' }));
  });

  it('tolerates a few null hours but needs at least 12 readings', () => {
    const temps = ramp(10, 20).map((v, i) => (i % 4 === 0 ? null : v)); // 6 nulls -> 18 valid
    expect(parseHourly(live('2024-05-01', temps, ramp(60, 80)), d('2024-05-01')).temperatureC).not.toBeNull();
    const sparse = ramp(10, 20).map((v, i) => (i < 13 ? null : v)); // 11 valid
    const r = parseHourly(live('2024-05-01', sparse, ramp(60, 80)), d('2024-05-01'));
    expect(r.temperatureC).toBeNull();
    expect(r.humidityPct).toBe(70); // humidity still usable on its own
  });

  it('all-null data (the archive for a not-yet-available day) is "no_data"', () => {
    const nulls = Array<null>(24).fill(null);
    expect(() => parseHourly(live('2024-05-01', nulls, nulls), d('2024-05-01'))).toThrowError(expect.objectContaining({ code: 'no_data' }));
  });

  it('maps the real rate-limit error body to rate_limited, other errors to bad_response', () => {
    const limited = { error: true, reason: 'Daily API request limit exceeded. Please try again tomorrow.' };
    expect(() => parseHourly(limited, d('2024-05-01'))).toThrowError(expect.objectContaining({ code: 'rate_limited' }));
    expect(() => parseHourly({ error: true, reason: 'Parameter latitude is invalid' }, d('2024-05-01'))).toThrowError(expect.objectContaining({ code: 'bad_response' }));
    expect(() => parseHourly(null, d('2024-05-01'))).toThrowError(expect.objectContaining({ code: 'bad_response' }));
    expect(() => parseHourly({ hourly: {} }, d('2024-05-01'))).toThrowError(expect.objectContaining({ code: 'bad_response' }));
  });

  it('negative temperatures and 0% humidity are values, not missing data', () => {
    const r = parseHourly(live('2024-01-01', ramp(-6, -2), Array(24).fill(0)), d('2024-01-01'));
    expect(r).toEqual({ temperatureC: -4, humidityPct: 0 });
  });
});

describe('fetchDailyWeather', () => {
  const coords = { latitude: 51.5, longitude: -0.13 };
  const good = (date: string) => live(date, ramp(10, 20), ramp(60, 80));

  it('uses the archive for a past day', async () => {
    const f = vi.fn(async () => ok(good('2024-05-01')));
    const r = await fetchDailyWeather(coords, d('2024-05-01'), d('2024-05-10'), f);
    expect(r).toEqual({ temperatureC: 15, humidityPct: 70 });
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('archive-api.open-meteo.com');
  });

  it('uses the forecast service for today', async () => {
    const f = vi.fn(async () => ok(good('2024-05-10')));
    await fetchDailyWeather(coords, d('2024-05-10'), d('2024-05-10'), f);
    expect((f.mock.calls[0] as unknown as [string])[0]).toContain('https://api.open-meteo.com/v1/forecast');
  });

  it('falls back to the forecast service when the archive has no data for that day', async () => {
    const nulls = Array<null>(24).fill(null);
    const f = vi.fn(async (url: string) => ok(url.includes('archive') ? live('2024-05-09', nulls, nulls) : good('2024-05-09')));
    const r = await fetchDailyWeather(coords, d('2024-05-09'), d('2024-05-10'), f);
    expect(r.temperatureC).toBe(15);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does NOT fall back on rate limiting or network failure (surfaces the real problem)', async () => {
    const limited = vi.fn(async () => ok({ error: true, reason: 'Daily API request limit exceeded' }, 429));
    await expect(fetchDailyWeather(coords, d('2024-05-01'), d('2024-05-10'), limited)).rejects.toMatchObject({ code: 'rate_limited' });
    expect(limited).toHaveBeenCalledTimes(1);
    const down = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    await expect(fetchDailyWeather(coords, d('2024-05-01'), d('2024-05-10'), down)).rejects.toMatchObject({ code: 'network' });
    expect(down).toHaveBeenCalledTimes(1);
  });

  it('treats an HTTP 5xx with a non-JSON body as a network problem; refuses future dates', async () => {
    const broken = vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }));
    await expect(fetchDailyWeather(coords, d('2024-05-01'), d('2024-05-10'), broken)).rejects.toMatchObject({ code: 'network' });
    await expect(fetchDailyWeather(coords, d('2024-05-11'), d('2024-05-10'), vi.fn())).rejects.toBeInstanceOf(WeatherError);
  });
});

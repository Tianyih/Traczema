import { useEffect, useRef, useState } from 'react';
import { CloudSun, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/i18n/LanguageContext';
import type { MessageKey } from '@/i18n';
import { defaultWeather } from '@/lib/dailyLogDraft';
import { todayISO } from '@/lib/date';
import { GeoError, getCurrentCoords } from '@/lib/weather/geolocation';
import { fetchDailyWeather, WeatherError } from '@/lib/weather/openMeteo';
import { FieldLabel, Notice, NumberField, Section } from '../fields';
import type { SectionProps } from '../types';

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ok' } | { kind: 'error'; key: MessageKey };

const errorKey = (e: unknown): MessageKey => {
  if (e instanceof GeoError) return `weather_err_${e.code}` as MessageKey;
  if (e instanceof WeatherError) return `weather_err_${e.code}` as MessageKey;
  return 'weather_err_network';
};

export function WeatherSection({ log, update }: SectionProps) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const w = log.weather;
  const setField = (patch: Partial<NonNullable<typeof w>>) => {
    // Once the user edits a value it is no longer "filled from Open-Meteo": drop that confirmation
    // (and any old error) so the source line honestly says "Entered manually".
    setStatus({ kind: 'idle' });
    update((l) => ({ ...l, weather: { ...(l.weather ?? defaultWeather()), ...patch, source: 'manual', fetchedAt: null } }));
  };

  const autofill = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus({ kind: 'loading' });
    try {
      const coords = await getCurrentCoords();
      const result = await fetchDailyWeather(coords, log.date, todayISO(), undefined, ctrl.signal);
      if (ctrl.signal.aborted) return;
      update((l) => {
        const prev = l.weather ?? defaultWeather();
        return {
          ...l,
          // Only overwrite what the service returned; keep anything it could not provide.
          weather: {
            temperatureC: result.temperatureC ?? prev.temperatureC,
            humidityPct: result.humidityPct ?? prev.humidityPct,
            source: 'open-meteo',
            fetchedAt: Date.now(),
          },
        };
      });
      setStatus({ kind: 'ok' });
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setStatus({ kind: 'error', key: errorKey(e) });
    }
  };

  return (
    <Section title={t('sec_weather')} filled={w !== null} onClear={() => { setStatus({ kind: 'idle' }); update((l) => ({ ...l, weather: null })); }}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="weather-temp">{t('weather_temp')}</FieldLabel>
          <NumberField id="weather-temp" step={0.1} min={-60} max={60} value={w?.temperatureC ?? null} onChange={(v) => setField({ temperatureC: v })} />
        </div>
        <div>
          <FieldLabel htmlFor="weather-humidity">{t('weather_humidity')}</FieldLabel>
          <NumberField id="weather-humidity" step={1} min={0} max={100} value={w?.humidityPct ?? null} onChange={(v) => setField({ humidityPct: v })} />
        </div>
      </div>
      <div className="space-y-2">
        <Button variant="outline" data-testid="weather-autofill" onClick={() => void autofill()} disabled={status.kind === 'loading'}>
          {status.kind === 'loading' ? <Loader2 className="animate-spin" /> : <CloudSun />}
          {status.kind === 'loading' ? t('weather_fetching') : t('weather_autofill')}
        </Button>
        {status.kind === 'ok' && <Notice tone="success" testId="weather-status">{t('weather_filled')}</Notice>}
        {status.kind === 'error' && <Notice tone="error" testId="weather-status">{t(status.key)}</Notice>}
        {w && status.kind !== 'ok' && (
          <p className="text-xs text-muted-foreground" data-testid="weather-source">
            {w.source === 'open-meteo' ? t('weather_source_open_meteo') : t('weather_source_manual')}
          </p>
        )}
        <p className="text-xs text-muted-foreground">{t('weather_privacy')}</p>
      </div>
    </Section>
  );
}

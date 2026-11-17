import { isISODate } from '@/lib/date';
import type { BodyPartLog, DailyLog } from './types';
import { LESION_STATUSES, REGION_IDS, RESIDUAL_SKIN_STATES } from './types';

export class ValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = 'ValidationError';
  }
}

const isInt = (n: number) => Number.isInteger(n);

function intRange(field: string, v: number | null, min: number, max: number): void {
  if (v === null) return;
  if (typeof v !== 'number' || !isInt(v) || v < min || v > max) {
    throw new ValidationError(field, `must be an integer in [${min}, ${max}] (got ${String(v)})`);
  }
}

function numRange(field: string, v: number | null, min: number, max: number): void {
  if (v === null) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new ValidationError(field, `must be a number in [${min}, ${max}] (got ${String(v)})`);
  }
}

function halfSteps(field: string, v: number | null): void {
  if (v !== null && (v * 2) % 1 !== 0) throw new ValidationError(field, 'must be a multiple of 0.5');
}

export function validateDailyLog(log: DailyLog): void {
  if (!isISODate(log.date)) throw new ValidationError('date', `invalid ISO date: ${String(log.date)}`);
  intRange('overallSeverity', log.overallSeverity, 0, 10);
  intRange('itchIntensity', log.itchIntensity, 0, 10);
  intRange('stressLevel', log.stressLevel, 1, 10);
  if (log.weather) {
    numRange('weather.temperatureC', log.weather.temperatureC, -60, 60);
    numRange('weather.humidityPct', log.weather.humidityPct, 0, 100);
  }
  if (log.exercise) numRange('exercise.durationMin', log.exercise.durationMin, 0, 1440);
  if (log.shower) numRange('shower.durationMin', log.shower.durationMin, 0, 240);
  if (log.sleep) {
    numRange('sleep.hours', log.sleep.hours, 0, 24);
    halfSteps('sleep.hours', log.sleep.hours);
    intRange('sleep.quality', log.sleep.quality, 1, 5);
  }
  const anchor = log.bedding?.assumedLastWashDate ?? null;
  if (anchor !== null) {
    if (!isISODate(anchor)) throw new ValidationError('bedding.assumedLastWashDate', 'invalid ISO date');
    if (anchor > log.date) {
      throw new ValidationError('bedding.assumedLastWashDate', 'cannot be after the log date');
    }
  }
}

export function validateBodyPartLog(log: BodyPartLog): void {
  if (!isISODate(log.date)) throw new ValidationError('date', `invalid ISO date: ${String(log.date)}`);
  if (!REGION_IDS.includes(log.regionId)) throw new ValidationError('regionId', `unknown region ${log.regionId}`);
  if (!LESION_STATUSES.includes(log.status)) throw new ValidationError('status', `unknown status ${log.status}`);
  intRange('severity', log.severity, 0, 10);
  if ((log.status === 'clear' || log.status === 'healed') && log.severity !== 0) {
    throw new ValidationError('severity', `must be 0 when status is ${log.status}`);
  }
  if (log.status === 'active' && log.severity < 1) {
    throw new ValidationError('severity', 'must be at least 1 for an active flare');
  }
  for (const s of log.residualSkin) {
    if (!RESIDUAL_SKIN_STATES.includes(s)) throw new ValidationError('residualSkin', `unknown state ${s}`);
  }
  if (log.residualSkin.length > 0 && log.status !== 'healing' && log.status !== 'healed') {
    throw new ValidationError('residualSkin', 'only allowed when status is healing or healed');
  }
  if (log.residualSkin.includes('normal_skin') && log.residualSkin.length > 1) {
    throw new ValidationError('residualSkin', "'normal_skin' cannot be combined with other states");
  }
}

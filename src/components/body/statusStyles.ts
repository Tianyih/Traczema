import type { LesionStatus } from '@/db/types';
import { severityColor } from '@/lib/heat';

/** Post-healing colour: calm teal, deliberately outside the green->red severity ramp. */
export const HEALED_COLOR = '#8fd3c4';

/**
 * Fill for a body region. Active flares use the same heat colours as the calendar so the two views
 * read as one system; healing uses the same colour plus hatching (see BodyMap), so status is never
 * conveyed by colour alone.
 */
export function regionFill(status: LesionStatus, severity: number): string {
  switch (status) {
    case 'active':
    case 'healing':
      return severityColor(Math.max(1, severity));
    case 'healed':
      return HEALED_COLOR;
    case 'clear':
      return 'var(--muted)';
  }
}

/** Small colour chip used in legends and lists. */
export function statusDotStyle(status: LesionStatus): { background: string; backgroundImage?: string } {
  if (status === 'healing') {
    return { background: severityColor(4), backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,.4) 0 1.5px, transparent 1.5px 4px)' };
  }
  return { background: status === 'active' ? severityColor(7) : regionFill(status, 0) };
}

import { boxGeometry } from '@/lib/analytics/view';
import type { LevelStats } from '@/lib/analytics';

/** Tiny box plot on the fixed 0-10 severity scale: whisker = min..max, box = Q1..Q3, tick = median. */
export function SpreadGlyph({ level, width = 96, label }: { level: LevelStats; width?: number; label: string }) {
  const g = boxGeometry(level, [0, 10], width - 8);
  if (!g) return <span className="text-[var(--viz-muted)]">—</span>;
  const x = (v: number) => v + 4;
  return (
    <svg width={width} height={16} viewBox={`0 0 ${width} 16`} role="img" aria-label={label} className="block">
      <line x1={x(g.min)} x2={x(g.max)} y1={8} y2={8} stroke="var(--viz-muted)" strokeWidth={1.5} strokeLinecap="round" />
      <rect x={x(g.q1)} y={3} width={Math.max(2, g.q3 - g.q1)} height={10} rx={2} fill="var(--viz-neutral)" fillOpacity={0.35} stroke="var(--viz-ink-2)" strokeWidth={1} />
      <line x1={x(g.median)} x2={x(g.median)} y1={2} y2={14} stroke="var(--viz-ink)" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

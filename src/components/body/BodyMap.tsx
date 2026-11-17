import type { KeyboardEvent } from 'react';
import type { RegionId } from '@/db/types';
import { useLanguage } from '@/i18n/LanguageContext';
import type { RegionSummary } from '@/lib/derive/regionTimeline';
import type { BodyView } from '@/lib/regions';
import { BODY_SHAPES, MIRROR_TRANSFORM, VIEWBOX } from './bodyMapShapes';
import { regionFill } from './statusStyles';

export interface BodyMapProps {
  view: BodyView;
  summaries: Record<RegionId, RegionSummary> | null;
  selected: RegionId | null;
  onSelect: (region: RegionId) => void;
}

/** One side of the dual-view body map. Every region is a focusable, labelled button. */
export function BodyMap({ view, summaries, selected, onSelect }: BodyMapProps) {
  const { t } = useLanguage();
  const { shapes, silhouette } = BODY_SHAPES[view];
  const hatchId = `hatch-${view}`;

  return (
    <svg
      viewBox={`${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.width} ${VIEWBOX.height}`}
      role="group"
      aria-label={`${t(view === 'anterior' ? 'body_view_anterior' : 'body_view_posterior')}. ${t('body_map_aria')}`}
      data-testid={`body-map-${view}`}
      className="h-auto w-full"
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(0,0,0,0.42)" strokeWidth="2" />
        </pattern>
      </defs>

      {silhouette.map((part) => (
        <g key={part.id} aria-hidden="true">
          <path d={part.d} className="body-part-static" />
          {part.mirrored && <path d={part.d} transform={MIRROR_TRANSFORM} className="body-part-static" />}
        </g>
      ))}

      {shapes.map(({ region, d, mirrored }) => {
        const summary = summaries?.[region];
        const status = summary?.currentStatus ?? 'clear';
        const severity = summary?.currentSeverity ?? 0;
        const name = t(`region_${region}`);
        const label =
          status === 'active' || status === 'healing'
            ? t('body_map_region_aria_sev', { region: name, status: t(`status_${status}`), severity })
            : t('body_map_region_aria', { region: name, status: t(`status_${status}`) });
        const fill = regionFill(status, severity);
        const activate = () => onSelect(region);
        const onKey = (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activate();
          }
        };
        const copies = mirrored ? [undefined, MIRROR_TRANSFORM] : [undefined];
        return (
          <g
            key={region}
            className="body-region"
            role="button"
            tabIndex={0}
            aria-pressed={selected === region}
            aria-label={label}
            data-region={region}
            data-status={status}
            data-severity={severity}
            onClick={activate}
            onKeyDown={onKey}
          >
            <title>{label}</title>
            {copies.map((transform, i) => (
              <g key={i} transform={transform}>
                <path d={d} style={{ fill }} className="body-region-shape" />
                {status === 'healing' && <path d={d} fill={`url(#${hatchId})`} pointerEvents="none" />}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

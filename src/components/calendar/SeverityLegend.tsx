import { BedDouble, Camera, Flame } from 'lucide-react';
import { useLanguage } from '@/i18n/LanguageContext';
import { heatGradient } from '@/lib/heat';

export function SeverityLegend() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground" data-testid="legend">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground">{t('cal_legend_title')}</span>
        <span>{t('cal_legend_none')}</span>
        <span aria-hidden className="h-2.5 w-28 rounded-full border" style={{ background: heatGradient() }} />
        <span>{t('cal_legend_severe')}</span>
      </div>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <li className="flex items-center gap-1"><Camera className="size-3.5" /> {t('cal_legend_photos')}</li>
        <li className="flex items-center gap-1"><Flame className="size-3.5 text-red-600" /> {t('cal_legend_flares')}</li>
        <li className="flex items-center gap-1"><BedDouble className="size-3.5 text-sky-700" /> {t('cal_bedding_washed')}</li>
      </ul>
    </div>
  );
}

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/lib/utils';

export const Slider = React.forwardRef<
  React.ComponentRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { muted?: boolean }
>(({ className, muted, 'aria-label': ariaLabel, ...props }, ref) => (
  // Radix does not forward `aria-label` from the root to the focusable thumb, so name the thumb directly.
  <SliderPrimitive.Root ref={ref} className={cn('relative flex h-6 w-full touch-none select-none items-center', className)} {...props}>
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
      <SliderPrimitive.Range className={cn('absolute h-full bg-primary', muted && 'opacity-0')} />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={ariaLabel}
      className={cn('block size-5 rounded-full border-2 border-primary bg-card shadow transition-opacity', muted && 'opacity-60')}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = 'Slider';

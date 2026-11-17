import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

/** Centred modal (used for the photo viewer). */
export const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { closeLabel: string }
>(({ className, children, closeLabel, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 [animation:fade-in_150ms_ease-out]" />
    <DialogPrimitive.Content
      ref={ref}
      className={cn('fixed left-1/2 top-1/2 z-50 w-[min(94vw,52rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-3 shadow-xl outline-none sm:p-4', className)}
      {...props}
    >
      {children}
      <DialogPrimitive.Close aria-label={closeLabel} className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-md bg-card/90 text-muted-foreground hover:bg-muted">
        <X className="size-5" />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

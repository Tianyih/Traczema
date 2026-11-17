import * as React from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuLabel = Menu.Label;
export const DropdownMenuSeparator = (p: React.ComponentProps<typeof Menu.Separator>) => <Menu.Separator className="my-1 h-px bg-border" {...p} />;

export const DropdownMenuContent = React.forwardRef<
  React.ComponentRef<typeof Menu.Content>,
  React.ComponentPropsWithoutRef<typeof Menu.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <Menu.Portal>
    <Menu.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn('z-50 min-w-64 rounded-lg border bg-card p-1 text-sm shadow-lg', className)}
      {...props}
    />
  </Menu.Portal>
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof Menu.Item>,
  React.ComponentPropsWithoutRef<typeof Menu.Item>
>(({ className, ...props }, ref) => (
  <Menu.Item
    ref={ref}
    className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted', className)}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from './dialog';
import { cn } from './utils';

interface StandardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const sizeClasses = {
  sm: 'w-[calc(100vw-2rem)] max-w-md sm:max-w-md h-[70dvh]',
  md: 'w-[calc(100vw-2rem)] max-w-2xl sm:max-w-2xl h-[80dvh]',
  lg: 'w-[calc(100vw-2rem)] max-w-4xl sm:max-w-4xl h-[85dvh]',
  xl: 'w-[calc(100vw-2rem)] sm:max-w-none h-[90dvh] lg:h-[96dvh]',
  full: 'w-[calc(100vw-2rem)] sm:max-w-none lg:w-[70vw] h-[90dvh]',
};

export function StandardDialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  children,
  footer,
  className
}: StandardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          sizeClasses[size],
          'flex flex-col overflow-hidden',
          className
        )}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <DialogBody className="flex-1 overflow-y-auto min-h-0">
          {children}
        </DialogBody>

        {footer && (
          <DialogFooter className="flex-shrink-0">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

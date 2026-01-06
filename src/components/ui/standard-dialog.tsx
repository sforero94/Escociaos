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
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

const sizeClasses = {
  sm: 'w-[90vw] max-w-md sm:max-w-md h-[70vh]',          // Small forms (ProveedorDialog)
  md: 'w-[90vw] max-w-2xl sm:max-w-2xl h-[80vh]',       // Medium forms (CompletarGastoDialog, NuevoMovimiento)
  lg: 'w-[90vw] max-w-4xl sm:max-w-4xl h-[85vh]',       // Large forms (CrearEditarTareaDialog)
  xl: 'w-[90vw] sm:max-w-none h-[96vh]',                 // Extra large (RegistrarTrabajoDialog) - no max-width constraint
  full: 'w-[70vw] sm:max-w-none h-[90vh]',               // Full size (TareaDetalleDialog, CatalogoTiposDialog)
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

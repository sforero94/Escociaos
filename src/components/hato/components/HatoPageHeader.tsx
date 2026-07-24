// ARCHIVO: components/hato/components/HatoPageHeader.tsx
// DESCRIPCIÓN: Encabezado compartido de las pantallas del módulo Hato
// Lechero (Figma alignment spec §1a). Reemplaza los bloques `<h1>` ad-hoc
// que cada pantalla armaba por su cuenta -- breadcrumb + título + subtítulo
// opcional + slot de acciones a la derecha. Sin selector de finca ni
// avatar: eso es competencia del shell de la app (Layout.tsx), fuera de
// alcance de este componente.

import type { ReactNode } from 'react';

export interface HatoPageHeaderProps {
  /** Segmento izquierdo del breadcrumb, antes de la "/". Default "Hato
   * Lechero" -- todas las pantallas del módulo cuelgan de esa raíz. */
  breadcrumb?: string;
  /** Segmento derecho del breadcrumb (en negrita), p. ej. "Dashboard". */
  section: string;
  /** Título grande de la página (el `<h1>` real). */
  title: string;
  /** Línea de contexto opcional bajo el título, p. ej. "Finca Subachoque". */
  subtitle?: ReactNode;
  /** Slot alineado a la derecha para botones/badges de acción. */
  actions?: ReactNode;
}

export function HatoPageHeader({ breadcrumb = 'Hato Lechero', section, title, subtitle, actions }: HatoPageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-xs text-gray-500 mb-1">
          {breadcrumb} / <span className="font-semibold text-foreground">{section}</span>
        </p>
        <h1 className="text-foreground mb-1">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

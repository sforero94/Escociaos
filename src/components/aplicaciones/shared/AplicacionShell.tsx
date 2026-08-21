import { Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import type { EstadoAplicacion } from '@/types/aplicaciones';
import { EstadoAplicacionBadge } from './EstadoAplicacionBadge';

interface AplicacionShellProps {
  titulo: string;
  subtitulo?: string;
  estado?: EstadoAplicacion | null;
  /** default '/aplicaciones' */
  volverA?: string;
  acciones?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Marco de página compartido para las pantallas del módulo de Aplicaciones (Calculadora,
 * Movimientos, Cierre y Reporte): breadcrumb de vuelta a Aplicaciones, título + estado,
 * slot de acciones y slot de contenido.
 *
 * Cierre pasa de modal falso (`fixed inset-0` sobre la app en gris) a página completa
 * construida con este componente — un refresh de página no debe perder el trabajo en curso
 * porque ya no depende de un modal montado en memoria (ver decisión 1 del contrato de Fase 0).
 */
export function AplicacionShell({
  titulo,
  subtitulo,
  estado,
  volverA = '/aplicaciones',
  acciones,
  children,
}: AplicacionShellProps) {
  return (
    <div className="min-h-screen bg-background py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-[1200px] mx-auto space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={volverA}>Aplicaciones</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{titulo}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-foreground">{titulo}</h1>
                  {estado !== undefined && <EstadoAplicacionBadge estado={estado ?? null} />}
                </div>
                {subtitulo && <p className="text-brand-brown/70 mt-1">{subtitulo}</p>}
              </div>
            </div>

            {acciones && <div className="flex items-center gap-3 flex-wrap">{acciones}</div>}
          </div>
        </div>

        {children}
      </div>
    </div>
  );
}

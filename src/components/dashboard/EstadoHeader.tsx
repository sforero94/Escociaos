import type { Alerta } from './AlertList';

const ETIQUETAS_TIPO: Record<Alerta['tipo'], string> = {
  monitoreo: 'monitoreo',
  gasto: 'presupuesto',
  aplicacion: 'aplicaciones',
  vencimiento: 'vencimientos',
  labor: 'labores',
  ganado: 'ganado',
  stock: 'inventario',
};

function resumenTipos(alertas: Alerta[]): string {
  const tiposUnicos = Array.from(new Set(alertas.map((a) => ETIQUETAS_TIPO[a.tipo])));
  return tiposUnicos.slice(0, 2).join(' y ');
}

/**
 * EstadoHeader - Una línea de estado al abrir el dashboard: en un día
 * tranquilo, es prácticamente todo lo que hay que leer.
 */
export function EstadoHeader({ alertas, loading }: { alertas: Alerta[]; loading?: boolean }) {
  if (loading) {
    return <div className="h-6 w-64 bg-gray-200 rounded animate-pulse" />;
  }

  if (alertas.length === 0) {
    return (
      <p className="text-foreground font-medium">
        Sin alertas activas — todo dentro de lo esperado.
      </p>
    );
  }

  return (
    <p className="text-foreground font-medium">
      {alertas.length} {alertas.length === 1 ? 'alerta activa' : 'alertas activas'}: {resumenTipos(alertas)}.
    </p>
  );
}

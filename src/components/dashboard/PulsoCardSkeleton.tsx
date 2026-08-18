/**
 * PulsoCardSkeleton - esqueleto compartido por las tres tarjetas del bloque
 * "Pulso por negocio" mientras cargan (docs/plan_dashboard_centro_control.md
 * §9.1: "Skeleton por bloque, del tamaño final. Nunca un spinner de
 * pantalla completa").
 */
export function PulsoCardSkeleton() {
  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 lg:p-5 shadow-sm animate-pulse">
      <div className="flex items-start justify-between gap-2">
        <div className="h-3 bg-gray-200 rounded w-24" />
        <div className="h-5 bg-gray-100 rounded-full w-20" />
      </div>
      <div className="h-7 bg-gray-200 rounded w-28 mt-4" />
      <div className="h-3 bg-gray-100 rounded w-36 mt-2" />
      <div className="h-3 bg-gray-100 rounded w-32 mt-4 pt-3 border-t border-gray-100" />
    </div>
  );
}

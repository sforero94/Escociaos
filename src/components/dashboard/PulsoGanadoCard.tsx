import { useNavigate } from 'react-router-dom';
import { formatNumber, formatRelativeTime } from '@/utils/format';
import { PulsoChipFrescura } from './PulsoChipFrescura';
import { PulsoBarraHorizontal } from './PulsoBarraHorizontal';
import { PulsoFilaAccion } from './PulsoFilaAccion';
import { PulsoCardSkeleton } from './PulsoCardSkeleton';
import { usePulsoGanado, type UsoPulsoGanado } from './hooks/usePulsoGanado';

const RUTA_GANADO = '/ganado';

export interface PulsoGanadoCardViewProps extends UsoPulsoGanado {
  onNavigate: () => void;
}

/**
 * PulsoGanadoCardView - presentación pura de la tarjeta "Ganado de Ceba"
 * (docs/plan_dashboard_centro_control.md §3.3), separada de
 * `PulsoGanadoCard` (el contenedor que hace I/O vía `usePulsoGanado`) para
 * poder testear el contrato de render con fixtures estáticas.
 *
 * Dato principal: cabezas totales + reparto novillos/toros; debajo, barras
 * horizontales por finca. Cabezas/ha se OMITE con su causa declarada cuando
 * `cabezasPorHa` es `null` (todas las fincas capturadas tienen hectáreas en
 * 0) -- nunca un `0` fabricado (`calcularKPIsInventario`, reusado tal cual,
 * ya decide esa regla).
 *
 * Sin umbral de vejez definido por el dueño para el inventario de ganado
 * (a diferencia del pesaje del hato o la ronda de monitoreo): el chip de
 * frescura muestra la última actualización pero nunca se pinta en ámbar --
 * inventar un umbral de negocio no pedido violaría la misma regla que
 * prohíbe una constante de negocio sin decisión registrada.
 */
export function PulsoGanadoCardView({ cargando, error, datos, onNavigate }: PulsoGanadoCardViewProps) {
  if (cargando) return <PulsoCardSkeleton />;

  const chipLabel = datos?.ultimaActualizacion
    ? `Actualizado ${formatRelativeTime(datos.ultimaActualizacion)}`
    : 'Sin actualizaciones';

  const maxCabezas = datos ? Math.max(1, ...datos.porFinca.map((f) => f.cabezas)) : 1;

  return (
    <div className="rounded-xl border border-primary/10 bg-white p-4 lg:p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-brand-brown/60">Ganado de Ceba</p>
        {!error && <PulsoChipFrescura label={chipLabel} />}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-brand-brown/60">No se pudo cargar el inventario de ganado.</p>
      ) : datos === null ? (
        <div className="mt-3">
          <p className="text-2xl font-bold text-brand-brown/40">—</p>
          <p className="text-sm text-brand-brown/60 mt-1">Sin datos de inventario</p>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-2xl font-bold text-foreground">
            {formatNumber(datos.totalCabezas)}
            <span className="text-sm font-normal text-brand-brown/60 ml-1">cabezas</span>
          </p>
          <p className="text-sm text-brand-brown/60 mt-1">
            {formatNumber(datos.totalNovillos)} novillos · {formatNumber(datos.totalToros)} toros
          </p>

          {datos.porFinca.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2.5">
              {datos.porFinca.map((f) => (
                <PulsoBarraHorizontal
                  key={f.finca}
                  etiqueta={f.finca}
                  valorTexto={formatNumber(f.cabezas)}
                  proporcion={f.cabezas / maxCabezas}
                  colorClassName="bg-primary"
                />
              ))}
            </div>
          )}

          {/* Hueco declarado, nunca un 0 (plan §3.3: "Mostrarlo sería un —
              permanente"). El número de fincas es dinámico -- nunca "las 8
              fincas" hardcodeado. */}
          {datos.cabezasPorHa === null && datos.porFinca.length > 0 && (
            <p className="mt-3 text-xs text-brand-brown/60">
              Cabezas/ha no disponible — las {datos.porFinca.length} finca{datos.porFinca.length === 1 ? '' : 's'}{' '}
              tienen hectáreas en 0 en Configuración → Ganado.
            </p>
          )}
        </div>
      )}

      {!error && (
        <PulsoFilaAccion onClick={onNavigate}>
          <p className="text-sm text-brand-brown/60">Ver ganado</p>
        </PulsoFilaAccion>
      )}
    </div>
  );
}

/** PulsoGanadoCard - contenedor: I/O (`usePulsoGanado`) + navegación,
 *  pintado por `PulsoGanadoCardView`. Es lo único que monta el resto del
 *  tablero. */
export function PulsoGanadoCard() {
  const navigate = useNavigate();
  const resultado = usePulsoGanado();
  return <PulsoGanadoCardView {...resultado} onNavigate={() => navigate(RUTA_GANADO)} />;
}

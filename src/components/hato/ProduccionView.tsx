// ARCHIVO: components/hato/ProduccionView.tsx
// DESCRIPCIÓN: `/hato-lechero/produccion` v2 -- solo CONSULTA (D4). Rediseño
// pedido por el dueño el 2026-10-16 ("demasiadas cosas, difícil de leer";
// lienzo "Producción Hato v2", decisiones D1–D20):
//   1. Un solo selector de período (quincena, mes, trimestre, año) que
//      gobierna toda la página, y cada cifra contra el período anterior.
//   2. Aviso "Falta cargar" que lleva a Cargas -- cargar ya no vive aquí.
//   3. Ventas (dato real, Gerencia) y Producción pesada (aproximado) en dos
//      bloques separados que nunca se mezclan.
//   4. Comparar vacas al final.
// La aritmética vive en `utils/hato/produccionV2.ts`.

import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { RoleGuard } from '@/components/auth/RoleGuard';
import {
  PERIODOS_PRODUCCION,
  etiquetaDiaPesaje,
  etiquetaRango,
  rangoAnteriorProduccion,
  rangoPeriodoProduccion,
  type PeriodoProduccion,
} from '@/utils/hato/produccionV2';
import { useProduccionV2 } from './hooks/useProduccionV2';
import { HatoPageHeader } from './components/HatoPageHeader';
import { DetallePesajeSemanalDialog } from './components/DetallePesajeSemanalDialog';
import { AvisoFaltaCargar } from './components/produccion/AvisoFaltaCargar';
import { VentasProduccionBloque } from './components/produccion/VentasProduccionBloque';
import { ProduccionPesadaBloque } from './components/produccion/ProduccionPesadaBloque';
import { CompararVacasBloque } from './components/produccion/CompararVacasBloque';

/** `fin_ingresos` es Gerencia-only por RLS: el gate es el ROL, nunca el
 * resultado vacío de la consulta (que se vería igual que "no hubo ventas"). */
function CandadoVentas() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
        <Lock className="h-4 w-4 text-amber-600" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">Ventas</p>
        <p className="text-xs text-gray-500">Las ventas del hato requieren permisos de Gerencia.</p>
      </div>
    </div>
  );
}

const ETIQUETA_PERIODO: Record<PeriodoProduccion, string> = {
  ultimos3: 'los 3 meses',
  anio: 'el año',
};

export function ProduccionView() {
  const d = useProduccionV2();
  const { isLoading: authLoading } = useAuth();
  const [periodo, setPeriodo] = useState<PeriodoProduccion>('ultimos3');
  const [detalleFecha, setDetalleFecha] = useState<string | null>(null);

  const rango = useMemo(() => rangoPeriodoProduccion(periodo, d.hoy), [periodo, d.hoy]);
  const rangoAnterior = useMemo(() => rangoAnteriorProduccion(periodo, rango), [periodo, rango]);
  const meta = PERIODOS_PRODUCCION.find((p) => p.id === periodo)!;

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <HatoPageHeader
          section="Producción"
          title="Producción"
          subtitle={`${etiquetaRango(rango)} · contra ${meta.etiquetaAnterior}`}
          actions={
            <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
              {PERIODOS_PRODUCCION.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={periodo === p.id}
                  onClick={() => setPeriodo(p.id)}
                  className={`h-11 rounded-md border px-3 text-sm sm:h-9 ${
                    periodo === p.id ? 'border-primary bg-primary text-primary-foreground' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          }
        />

        <AvisoFaltaCargar pendientes={d.pendientes} />

        {authLoading ? (
          <div className="h-64 animate-pulse rounded-xl border border-gray-200 bg-white" aria-hidden="true" />
        ) : (
          <RoleGuard allowedRoles={['Gerencia']} fallback={<CandadoVentas />}>
            <VentasProduccionBloque
              historial={d.historial}
              cargandoHistorial={d.cargandoHistorial}
              errorHistorial={d.errorHistorial}
              rango={rango}
              rangoAnterior={rangoAnterior}
              etiquetaAnterior={meta.etiquetaAnterior}
            />
          </RoleGuard>
        )}

        <ProduccionPesadaBloque
          pesajes={d.pesajes}
          partosPorAnimal={d.partosPorAnimal}
          identidadPorAnimal={d.identidadPorAnimal}
          cargando={d.cargandoPesajes}
          error={d.errorPesajes}
          rango={rango}
          rangoAnterior={rangoAnterior}
          etiquetaAnterior={meta.etiquetaAnterior}
          etiquetaPeriodo={ETIQUETA_PERIODO[periodo]}
          onFechaClick={setDetalleFecha}
        />

        <CompararVacasBloque
          pesajes={d.pesajes}
          partosPorAnimal={d.partosPorAnimal}
          identidadPorAnimal={d.identidadPorAnimal}
          rango={rango}
        />
      </div>

      <DetallePesajeSemanalDialog
        abierto={detalleFecha != null}
        semana={detalleFecha != null ? 0 : null}
        etiqueta={detalleFecha ? etiquetaDiaPesaje(detalleFecha) : null}
        fechaReferencia={detalleFecha}
        identidadPorAnimal={d.identidadPorAnimal}
        onCerrar={() => setDetalleFecha(null)}
        onCambio={d.recargar}
      />
    </div>
  );
}

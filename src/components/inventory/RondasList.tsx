// ARCHIVO: components/inventory/RondasList.tsx
// DESCRIPCIÓN: Ruta `/inventario/rondas` -- historial de rondas de
// inventario (C-3 del brief de producto, D-T10 del brief técnico). Sólo
// lectura: ningún RPC de escritura se llama desde esta pantalla (Fase 2,
// en curso en paralelo). RLS ya deja `SELECT` abierto a `authenticated` en
// `rondas_inventario`/`rondas_excepciones` desde la migración 125.
//
// Reemplaza en la navegación principal a `/inventario/verificaciones`
// (VerificacionesList.tsx), que sigue viva y consultable por continuidad
// histórica (D-1/CA-25: la única fila que tiene es un registro de prueba
// rotulado) -- ver el enlace al pie de esta pantalla y la nota de decisión
// en VerificacionesList.tsx.

import { Loader2, AlertTriangle, ClipboardList, ChevronRight, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { InventorySubNav } from './InventorySubNav';
import { ResumenDesenlacesChips } from './rondas/ResumenDesenlacesChips';
import { useRondasInventario } from './rondas/hooks/useRondasInventario';
import {
  ESTADO_RONDA_BADGE_CLASS,
  ESTADO_RONDA_LABELS,
  formatearPeriodoRonda,
} from '@/utils/rondaInventarioUi';
import { formatShortDate } from '@/utils/format';

export function RondasList() {
  const { rondas, loading, error, reload } = useRondasInventario();

  return (
    <div className="space-y-6">
      <InventorySubNav />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-foreground mb-2 flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-primary" />
            Rondas de Inventario
          </h1>
          <p className="text-brand-brown/70">
            Ronda mensual de conteo físico, con separación de funciones: Uriel cuenta, David explica, Santiago
            aprueba lo que no tiene respaldo.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-800">{error}</p>
          </div>
          <button
            onClick={() => reload()}
            className="text-sm text-red-700 hover:text-red-900 underline flex-shrink-0"
          >
            Reintentar
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : rondas.length === 0 ? (
        !error && (
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-12 text-center shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
            <ClipboardList className="w-16 h-16 text-brand-brown/40 mx-auto mb-4" />
            <h3 className="text-xl text-foreground mb-2">Todavía no hay rondas registradas</h3>
            <p className="text-brand-brown/60">
              La ronda mensual se arranca desde Telegram, con el recordatorio a Uriel. La primera ronda que se
              cierre aparece acá.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {rondas.map(({ ronda, resumen }) => (
            <Link
              key={ronda.id}
              to={`/inventario/rondas/${ronda.id}`}
              className="block bg-white/80 backdrop-blur-sm rounded-2xl border-2 border-primary/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)] hover:shadow-[0_6px_28px_rgba(115,153,28,0.12)] hover:border-primary/20 transition-all duration-200"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-lg text-foreground">{formatearPeriodoRonda(ronda.periodo)}</h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-xs font-medium border ${ESTADO_RONDA_BADGE_CLASS[ronda.estado]}`}
                    >
                      {ESTADO_RONDA_LABELS[ronda.estado]}
                    </span>
                    {ronda.es_linea_base && (
                      <span
                        className="px-2.5 py-0.5 rounded-lg text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200"
                        title="Primera ronda contra el sistema: su volumen de excepciones es deuda acumulada, no pérdida del mes (R-17)."
                      >
                        Línea base
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-brand-brown/60">
                    {ronda.alcance_declarado === 'parcial'
                      ? 'Alcance declarado: parcial'
                      : ronda.alcance_declarado === 'completo'
                        ? 'Alcance declarado: completo'
                        : 'Alcance todavía sin declarar'}
                    {ronda.cerrada_en && <> · Cerrada el {formatShortDate(ronda.cerrada_en)}</>}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-brand-brown/40 flex-shrink-0 hidden sm:block" />
              </div>

              <ResumenDesenlacesChips resumen={resumen} />
            </Link>
          ))}
        </div>
      )}

      <div className="pt-2 text-sm text-brand-brown/50 flex items-center gap-1.5">
        <History className="w-4 h-4" />
        <span>
          Antes de este rediseño existió un módulo de «Verificaciones» que nunca se usó de punta a punta.{' '}
          <Link to="/inventario/verificaciones" className="text-primary hover:underline">
            Ver el registro histórico
          </Link>
          .
        </span>
      </div>
    </div>
  );
}

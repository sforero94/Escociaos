// ARCHIVO: components/inventory/RondaDetalle.tsx
// DESCRIPCIÓN: Ruta `/inventario/rondas/:id` -- detalle de UNA ronda de
// inventario (C-3 del brief de producto, D-T10 del brief técnico). Sólo
// lectura. Muestra el alcance (resumido, R-2/R-3 -- CA-15/CA-16) y cada
// excepción con su trazabilidad completa (R-8/CA-12): quién reportó, quién
// explicó, quién capturó/propuso/decidió/aplicó.
//
// CA-10 -- el contrato que no se negocia: los tres desenlaces terminales
// (cerrada_sin_ajuste / resuelta_con_captura / el trío ajuste_aprobado-
// aplicado-desestimado) se agrupan en secciones separadas, cada una con su
// propio encabezado y color -- nunca un solo bloque "resuelto".
//
// R-15/CA-13, aplicado transversalmente (no sólo a Uriel): el valor de la
// diferencia sólo se muestra si la sesión es Gerencia. `rondas_inventario_
// alcance.precio_unitario` NO está gateado por RLS (SELECT abierto a
// `authenticated`, migración 125 §4.6) -- el gateo de este archivo es lo que
// evita que un Administrador/Verificador vea valoración en esta pantalla.

import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ClipboardList, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRondaDetalle } from './rondas/hooks/useRondaDetalle';
import { ExcepcionCard } from './rondas/ExcepcionCard';
import { ResumenDesenlacesChips } from './rondas/ResumenDesenlacesChips';
import { EstadoAlcanceLabel } from './rondas/EstadoAlcanceLabel';
import {
  ESTADO_RONDA_BADGE_CLASS,
  ESTADO_RONDA_LABELS,
  calcularResumenDesenlaces,
  formatearPeriodoRonda,
  resolverActor,
  textoObservacionLibre,
} from '@/utils/rondaInventarioUi';
import { formatNumber, formatShortDate } from '@/utils/format';
import type { EstadoExcepcionInventario, RondaExcepcionRow } from '@/types/rondaInventario';

const SECCIONES_DESENLACE: Array<{
  titulo: string;
  descripcion: string;
  estados: EstadoExcepcionInventario[];
}> = [
  {
    titulo: 'En curso',
    descripcion: 'Todavía no llegaron a un desenlace: esperando a David o a la decisión de Santiago.',
    estados: ['reportada', 'explicacion_precargada', 'explicada', 'ajuste_propuesto'],
  },
  {
    titulo: 'Cerradas sin ajuste',
    descripcion: 'El sistema estaba bien. No pasó nada, no se movió inventario.',
    estados: ['cerrada_sin_ajuste'],
  },
  {
    titulo: 'Resueltas con captura',
    descripcion: 'David capturó el movimiento real, sin pasar por Santiago (vía a, CA-8).',
    estados: ['resuelta_con_captura'],
  },
  {
    titulo: 'Ajustes (aprobados, aplicados o desestimados)',
    descripcion: 'Diferencias sin respaldo: siempre pasan por la aprobación de Santiago (vía b, CA-9).',
    estados: ['ajuste_aprobado', 'ajuste_aplicado', 'ajuste_desestimado'],
  },
];

export function RondaDetalle() {
  const { id } = useParams<{ id: string }>();
  const { detalle, loading, error, reload } = useRondaDetalle(id);
  const { hasRole } = useAuth();
  const mostrarValor = hasRole(['Gerencia']);

  const causasPorClave = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const c of detalle?.causas ?? []) mapa.set(c.clave, c.etiqueta);
    return mapa;
  }, [detalle?.causas]);

  const excepcionesPorSeccion = useMemo(() => {
    const excepciones = detalle?.excepciones ?? [];
    return SECCIONES_DESENLACE.map((seccion) => ({
      ...seccion,
      filas: excepciones.filter((e) => seccion.estados.includes(e.estado)),
    }));
  }, [detalle?.excepciones]);

  const resumen = useMemo(
    () => calcularResumenDesenlaces((detalle?.excepciones ?? []).map((e) => ({ estado: e.estado }))),
    [detalle?.excepciones],
  );

  const observaciones = useMemo(() => {
    const raw = detalle?.ronda.observaciones_libres;
    if (!Array.isArray(raw)) return [];
    return raw.map(textoObservacionLibre).filter((texto) => texto.length > 0);
  }, [detalle?.ronda.observaciones_libres]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !detalle) {
    return (
      <div className="space-y-6">
        <Link to="/inventario/rondas" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="w-4 h-4" /> Volver a Rondas de Inventario
        </Link>
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-800 flex-1">{error ?? 'No se encontró la ronda solicitada.'}</p>
          <button onClick={() => reload()} className="text-sm text-red-700 hover:text-red-900 underline flex-shrink-0">
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const { ronda, alcance, productosPorId, usuariosPorId, telegramPorId, totalProductosActivos } = detalle;

  // Conforme = dentro del alcance congelado Y sin ninguna excepción reportada
  // sobre él (R-2/CA-15). Una excepción sobre un producto fuera del alcance
  // (CA-4: Uriel puede reportar uno en cero) no resta de este conteo -- ese
  // producto nunca fue "conforme" para empezar, así que no puede dejar de serlo.
  const productosConExcepcionEnAlcance = new Set(
    detalle.excepciones.filter((e) => productosPorId.has(e.producto_id) && alcance.some((a) => a.producto_id === e.producto_id)).map((e) => e.producto_id),
  );
  const conformesCount = Math.max(alcance.length - productosConExcepcionEnAlcance.size, 0);
  const fueraDeAlcanceCount = totalProductosActivos != null ? Math.max(totalProductosActivos - alcance.length, 0) : null;

  const abierta = resolverActor(ronda.abierta_por_usuario, ronda.abierta_por_telegram, usuariosPorId, telegramPorId);
  const cerrada = resolverActor(ronda.cerrada_por_usuario, ronda.cerrada_por_telegram, usuariosPorId, telegramPorId);

  return (
    <div className="space-y-6">
      <Link to="/inventario/rondas" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="w-4 h-4" /> Volver a Rondas de Inventario
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h1 className="text-foreground flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-primary" />
            Ronda de {formatearPeriodoRonda(ronda.periodo)}
          </h1>
          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-medium border ${ESTADO_RONDA_BADGE_CLASS[ronda.estado]}`}>
            {ESTADO_RONDA_LABELS[ronda.estado]}
          </span>
          {ronda.es_linea_base && (
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-medium border bg-purple-50 text-purple-700 border-purple-200">
              Línea base
            </span>
          )}
        </div>
        {ronda.es_linea_base && (
          <p className="text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-xl px-4 py-2 mb-2">
            Primera ronda contra el sistema (R-17): compara por primera vez lo físico contra el inventario real en
            vez del Sheet paralelo que se usaba antes. Su volumen de excepciones es deuda acumulada, no pérdida del
            mes.
          </p>
        )}
        <p className="text-sm text-brand-brown/60">
          {abierta && <>Abierta por {abierta.nombre}{ronda.abierta_en && <> el {formatShortDate(ronda.abierta_en)}</>}</>}
          {abierta && cerrada && ' · '}
          {cerrada && <>Cerrada por {cerrada.nombre}{ronda.cerrada_en && <> el {formatShortDate(ronda.cerrada_en)}</>}</>}
          {!abierta && !cerrada && 'Sin abrir todavía.'}
        </p>
        {ronda.alcance_declarado === 'parcial' && ronda.alcance_nota && (
          <p className="text-sm text-amber-700 mt-1">Alcance parcial — no se recorrió: {ronda.alcance_nota}</p>
        )}
      </div>

      {/* Resumen del alcance (R-2/R-3, CA-15/CA-16) */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <h2 className="text-foreground mb-4">Alcance de la ronda</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-2xl text-foreground tabular-nums">{formatNumber(alcance.length)}</p>
            <p className="text-sm text-brand-brown/60">productos con existencia registrada al abrir</p>
          </div>
          <div>
            <p className="text-2xl text-primary tabular-nums">{formatNumber(conformesCount)}</p>
            <EstadoAlcanceLabel estado="conforme" className="text-sm" />
          </div>
          <div>
            <p className="text-2xl text-gray-400 tabular-nums">
              {fueraDeAlcanceCount != null ? formatNumber(fueraDeAlcanceCount) : '—'}
            </p>
            <EstadoAlcanceLabel estado="fuera_de_alcance" className="text-sm" />
          </div>
        </div>
      </div>

      {observaciones.length > 0 && (
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
          <h2 className="text-foreground mb-3">Observaciones libres (producto no catalogado, R-16)</h2>
          <ul className="space-y-1 list-disc list-inside text-sm text-brand-brown/70">
            {observaciones.map((texto, i) => (
              <li key={i}>{texto}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Excepciones agrupadas por desenlace -- CA-10: nunca fundidas */}
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-primary/10 p-6 shadow-[0_4px_24px_rgba(115,153,28,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-foreground">Excepciones</h2>
          <ResumenDesenlacesChips resumen={resumen} />
        </div>

        {resumen.total === 0 ? (
          <p className="text-sm text-brand-brown/60 py-4 text-center">
            Ronda limpia — ninguna excepción reportada dentro del alcance declarado.
          </p>
        ) : (
          <div className="space-y-6">
            {excepcionesPorSeccion
              .filter((seccion) => seccion.filas.length > 0)
              .map((seccion) => (
                <div key={seccion.titulo}>
                  <h3 className="text-sm text-foreground font-medium mb-1">
                    {seccion.titulo} ({seccion.filas.length})
                  </h3>
                  <p className="text-xs text-brand-brown/50 mb-3">{seccion.descripcion}</p>
                  <div className="space-y-3">
                    {seccion.filas.map((e: RondaExcepcionRow) => {
                      const producto = productosPorId.get(e.producto_id);
                      const alcanceProducto = alcance.find((a) => a.producto_id === e.producto_id);
                      return (
                        <ExcepcionCard
                          key={e.id}
                          excepcion={e}
                          nombreProducto={producto?.nombre ?? 'Producto sin identificar'}
                          unidad={producto?.unidad ?? ''}
                          precioUnitario={alcanceProducto?.precio_unitario ?? null}
                          causasPorClave={causasPorClave}
                          usuariosPorId={usuariosPorId}
                          telegramPorId={telegramPorId}
                          mostrarValor={mostrarValor}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

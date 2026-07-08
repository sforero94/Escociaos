import { useState, useMemo } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogTitle,
  DialogDescription
} from '../ui/dialog';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent
} from '../ui/tooltip';
import {
  MonitoreoConRelaciones,
  DatosMapaCalor,
  CeldaMapaCalor,
  FilaMapaCalor,
  RondaMonitoreo
} from '../../types/monitoreo';
import { formatearFecha } from '../../utils/fechas';
import { calcularIncidencia, clasificarGravedad } from '../../utils/calculosMonitoreo';

// ============================================
// INTERFACES
// ============================================

interface MapaCalorIncidenciasProps {
  monitoreos: MonitoreoConRelaciones[];
  // Rondas de monitoreo, en orden cronológico ascendente (más antigua primero).
  // Determina tanto la ventana de rondas usada para "Prom" como los N puntos
  // de la cadena de tendencia (según modoVisualizacion).
  rondas: Pick<RondaMonitoreo, 'id' | 'fecha_inicio'>[];
  modoVisualizacion: 'ultimo' | 'ultimos3' | 'ultimos6';
}

// Lotes sin monitoreos en más de este número de días se ocultan del mapa de
// calor y se excluyen de todos los cálculos, para que el tablero se mantenga vigente.
const DIAS_VIGENCIA_LOTE = 30;

function obtenerFecha(fecha: Date | string): string {
  return typeof fecha === 'string' ? fecha : fecha.toISOString().split('T')[0];
}

// "Beneficos"/"Benéficos" (con o sin tilde, cualquier capitalización) no son una
// plaga ni una enfermedad — se excluyen de los cálculos de incidencia.
function esBenefico(nombrePlaga: string): boolean {
  const normalizado = nombrePlaga.trim().toLowerCase();
  return normalizado === 'beneficos' || normalizado === 'benéficos';
}

// ============================================
// UTILIDAD: DETERMINAR COLOR DE CELDA
// ============================================

// Mismos cortes (10% / 30%) que el resto del módulo de monitoreo (Snapshot,
// Priorización, captura de registros) vía clasificarGravedad — un mismo % de
// incidencia debe verse igual de crítico en cualquier vista.
function obtenerColorIncidencia(incidencia: number | null): {
  bg: string;
  text: string;
  border: string;
} {
  if (incidencia === null) {
    return {
      bg: 'bg-gray-50',
      text: 'text-gray-400',
      border: 'border-gray-200'
    };
  }

  const { numerica } = clasificarGravedad(incidencia);
  if (numerica === 3) {
    return {
      bg: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-300'
    };
  } else if (numerica === 2) {
    return {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      border: 'border-yellow-300'
    };
  } else {
    return {
      bg: 'bg-green-100',
      text: 'text-green-800',
      border: 'border-green-300'
    };
  }
}

// ============================================
// COMPONENTE: CELDA DEL MAPA DE CALOR
// ============================================

interface CeldaProps {
  celda: CeldaMapaCalor | null;
  onClick: () => void;
}

function Celda({ celda, onClick }: CeldaProps) {
  const incidencia = celda?.incidenciaPromedio ?? null;
  const colores = obtenerColorIncidencia(incidencia);

  if (!celda) {
    // Celda vacía (sin datos)
    return (
      <td className="p-2 border border-gray-200">
        <div className={`${colores.bg} ${colores.border} rounded-lg p-3 text-center min-w-[80px] h-[60px] flex items-center justify-center border`}>
          <span className={`text-xs ${colores.text}`}>-</span>
        </div>
      </td>
    );
  }

  return (
    <td className="p-2 border border-gray-200">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={`${colores.bg} ${colores.border} rounded-lg p-3 text-center min-w-[80px] h-[60px] hover:opacity-80 transition-opacity cursor-pointer border w-full flex items-center justify-center`}
          >
            <div className={`font-bold text-lg ${colores.text}`}>
              {Math.round(celda.incidenciaPromedio)}%
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent className="!bg-gray-900 !text-white p-3 rounded-lg shadow-lg max-w-xs border border-gray-700">
          <div className="space-y-1">
            <p className="font-bold">{celda.plagaNombre} - {celda.loteNombre}</p>
            <p>Incidencia promedio: {Math.round(celda.incidenciaPromedio)}%</p>
            <p>Número de monitoreos: {celda.numeroMonitoreos}</p>
            <p className="text-xs opacity-75 mt-2">Click para ver detalles</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

// ============================================
// COMPONENTE: CELDA MÚLTIPLE (para mostrar varias ocurrencias)
// ============================================

interface CeldaMultipleProps {
  celda: CeldaMapaCalor | null;
  onClick: () => void;
}

function getArrowColor(prev: number | null, curr: number | null): string {
  if (prev === null || curr === null) return 'text-gray-300';
  const diff = curr - prev;
  if (Math.abs(diff) < 1) return 'text-gray-400';
  if (diff > 0) return 'text-red-500';
  return 'text-green-600';
}

function CeldaMultiple({ celda, onClick }: CeldaMultipleProps) {
  if (!celda) {
    return (
      <td className="p-3 border border-gray-200 text-center" style={{ backgroundColor: '#ffffff' }}>
        <span className="text-sm text-gray-300">—</span>
      </td>
    );
  }

  // Ya viene con exactamente una entrada por ronda de la ventana visible
  // (ver useMemo más abajo) — no se recorta aquí para no perder rondas en
  // modo "últimos6".
  const ocurrencias = celda.ocurrencias || [];

  return (
    <td className="p-3 border border-gray-200" style={{ backgroundColor: '#ffffff' }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className="hover:opacity-80 transition-opacity cursor-pointer w-full flex items-center justify-center gap-1"
          >
            {ocurrencias.map((oc, i) => {
              const colores = obtenerColorIncidencia(oc.incidencia);
              return (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && (
                    <span className={`text-sm font-bold ${getArrowColor(ocurrencias[i - 1].incidencia, oc.incidencia)}`}>→</span>
                  )}
                  {oc.incidencia === null ? (
                    <span className="text-gray-300 font-semibold text-sm px-2 py-0.5">—</span>
                  ) : (
                    <span className={`${colores.bg} ${colores.text} font-semibold text-sm px-2 py-0.5 rounded`}>
                      {Math.round(oc.incidencia)}%
                    </span>
                  )}
                </span>
              );
            })}
            {ocurrencias.length === 0 && (
              <span className="text-sm text-gray-300">—</span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent className="!bg-gray-900 !text-white p-3 rounded-lg shadow-lg max-w-xs border border-gray-700">
          <div className="space-y-1">
            <p className="font-bold">{celda.plagaNombre} - {celda.loteNombre}</p>
            <p>Incidencia promedio: {Math.round(celda.incidenciaPromedio)}%</p>
            <p>{celda.numeroMonitoreos} monitoreos</p>
            {ocurrencias.length > 0 && (
              <div className="mt-1 border-t border-gray-700 pt-1">
                {ocurrencias.map((oc, i) => (
                  <p key={i} className="text-xs">
                    {formatearFecha(oc.fecha)}: {oc.incidencia === null ? 'sin datos esa ronda' : `${Math.round(oc.incidencia)}%`}
                  </p>
                ))}
              </div>
            )}
            <p className="text-xs opacity-75 mt-2">Click para ver detalles</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </td>
  );
}

// ============================================
// COMPONENTE PRINCIPAL
// ============================================

export function MapaCalorIncidencias({
  monitoreos,
  rondas,
  modoVisualizacion
}: MapaCalorIncidenciasProps) {
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<CeldaMapaCalor | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  // ============================================
  // PROCESAMIENTO DE DATOS
  // ============================================

  const datosMapaCalor = useMemo((): DatosMapaCalor => {
    // 0. Última fecha de monitoreo por lote → determina qué lotes siguen vigentes.
    // Un lote sin mediciones en los últimos DIAS_VIGENCIA_LOTE días se excluye
    // por completo (no se muestra como columna y no afecta ningún promedio).
    // Esto sigue basado en fecha calendario real (recencia), no en rondas.
    const hoy = new Date();
    const ultimaFechaPorLote = new Map<string, { nombre: string; fecha: string }>();
    monitoreos.forEach(m => {
      const loteId = m.sublotes?.lote_id || m.lote_id;
      const fecha = obtenerFecha(m.fecha_monitoreo);
      const anterior = ultimaFechaPorLote.get(loteId);
      if (!anterior || fecha > anterior.fecha) {
        ultimaFechaPorLote.set(loteId, { nombre: m.lotes?.nombre || 'Desconocido', fecha });
      }
    });

    const lotesVigentes = new Set<string>();
    const lotesInactivos: DatosMapaCalor['lotesInactivos'] = [];
    ultimaFechaPorLote.forEach(({ nombre, fecha }, loteId) => {
      const dias = (hoy.getTime() - new Date(`${fecha}T00:00:00`).getTime()) / 86400000;
      if (dias <= DIAS_VIGENCIA_LOTE) {
        lotesVigentes.add(loteId);
      } else {
        lotesInactivos.push({ loteId, loteNombre: nombre, ultimaFecha: fecha });
      }
    });

    // 1. Ventana de rondas visible: últimas N rondas (3 o 6 según modoVisualizacion),
    // en orden cronológico. Tanto la cadena encadenada como "Prom" se calculan
    // sobre esta MISMA ventana, para que nunca queden en desacuerdo entre sí.
    const numOcurrencias = modoVisualizacion === 'ultimos6' ? 6 : 3;
    const rondasVentana = rondas.slice(-numOcurrencias);
    const rondaIdsVentana = new Set(rondasVentana.map(r => r.id));

    // 2. Monitoreos válidos: dentro de la ventana de rondas, en lotes vigentes,
    // excluyendo "Beneficos" (no son una plaga ni una enfermedad).
    const monitoreosVentana = monitoreos.filter(m => {
      const loteId = m.sublotes?.lote_id || m.lote_id;
      return rondaIdsVentana.has(m.ronda_id)
        && lotesVigentes.has(loteId)
        && !esBenefico(m.plagas_enfermedades_catalogo?.nombre || '');
    });

    // 3. Árboles monitoreados por (lote, ronda) — deduplicado por sublote, ya que cada
    // sublote reporta el mismo arboles_monitoreados sin importar la plaga.
    const loteRondaTreeTotals = new Map<string, number>();
    const subloteRondaSeen = new Map<string, number>();

    monitoreosVentana.forEach(m => {
      const loteId = m.sublotes?.lote_id || m.lote_id;
      const subRondaKey = `${loteId}|${m.sublote_id || loteId}|${m.ronda_id}`;
      const prev = subloteRondaSeen.get(subRondaKey) || 0;
      subloteRondaSeen.set(subRondaKey, Math.max(prev, m.arboles_monitoreados || 0));
    });
    subloteRondaSeen.forEach((trees, key) => {
      const [loteId, , rondaId] = key.split('|');
      const lrKey = `${loteId}|${rondaId}`;
      loteRondaTreeTotals.set(lrKey, (loteRondaTreeTotals.get(lrKey) || 0) + trees);
    });

    // 4. Agrupar monitoreos por combinación plaga-lote
    const mapaAgrupado = new Map<string, CeldaMapaCalor>();

    monitoreosVentana.forEach(m => {
      const plagaId = m.plaga_enfermedad_id;
      const plagaNombre = m.plagas_enfermedades_catalogo.nombre;
      const loteId = m.sublotes?.lote_id || m.lote_id; // Consolidar a nivel de lote
      const loteNombre = m.lotes?.nombre || 'Desconocido';

      const clave = `${plagaId}|${loteId}`;

      if (!mapaAgrupado.has(clave)) {
        mapaAgrupado.set(clave, {
          plagaId,
          plagaNombre,
          loteId,
          loteNombre,
          incidenciaPromedio: 0,
          numeroMonitoreos: 0,
          monitoreos: []
        });
      }

      const celda = mapaAgrupado.get(clave)!;
      celda.monitoreos.push(m);
      celda.numeroMonitoreos++;
    });

    // 5. Calcular incidencia promedio (ponderada sobre la ventana) Y ocurrencias
    // por ronda — una entrada por CADA ronda de rondasVentana, en orden, dejando
    // incidencia=null (blanco) cuando la plaga no se registró en esa ronda
    // puntual para ese lote, en vez de omitir la ronda silenciosamente.
    mapaAgrupado.forEach(celda => {
      const afectadosPorRonda = new Map<string, number>();
      celda.monitoreos.forEach(m => {
        afectadosPorRonda.set(m.ronda_id, (afectadosPorRonda.get(m.ronda_id) || 0) + (m.arboles_afectados || 0));
      });

      let sumAfectados = 0;
      let sumMonitoreados = 0;
      afectadosPorRonda.forEach((afectados, rondaId) => {
        sumAfectados += afectados;
        sumMonitoreados += loteRondaTreeTotals.get(`${celda.loteId}|${rondaId}`) || 0;
      });
      celda.incidenciaPromedio = calcularIncidencia(sumAfectados, sumMonitoreados);

      celda.ocurrencias = rondasVentana.map(ronda => {
        if (!afectadosPorRonda.has(ronda.id)) {
          return { fecha: ronda.fecha_inicio, incidencia: null };
        }
        const af = afectadosPorRonda.get(ronda.id) || 0;
        const treesRonda = loteRondaTreeTotals.get(`${celda.loteId}|${ronda.id}`) || 0;
        return { fecha: ronda.fecha_inicio, incidencia: calcularIncidencia(af, treesRonda) };
      });
    });

    // 6. Agrupar por plaga (filas)
    const filasMap = new Map<string, FilaMapaCalor>();

    mapaAgrupado.forEach(celda => {
      if (!filasMap.has(celda.plagaId)) {
        filasMap.set(celda.plagaId, {
          plagaId: celda.plagaId,
          plagaNombre: celda.plagaNombre,
          incidenciaPromedioTotal: 0,
          celdas: new Map()
        });
      }

      const fila = filasMap.get(celda.plagaId)!;
      fila.celdas.set(celda.loteId, celda);
    });

    // 7. Incidencia promedio por fila (plaga), sobre la misma ventana de rondas:
    // árboles afectados por esta plaga en toda la finca / árboles monitoreados
    // en las visitas (lote+ronda) donde se registró.
    filasMap.forEach(fila => {
      let sumAfectados = 0;
      let sumMonitoreados = 0;
      const loteRondasContadas = new Set<string>();

      fila.celdas.forEach(celda => {
        celda.monitoreos.forEach(m => {
          sumAfectados += m.arboles_afectados || 0;
          const key = `${celda.loteId}|${m.ronda_id}`;
          if (!loteRondasContadas.has(key)) {
            loteRondasContadas.add(key);
            sumMonitoreados += loteRondaTreeTotals.get(key) || 0;
          }
        });
      });

      fila.incidenciaPromedioTotal = calcularIncidencia(sumAfectados, sumMonitoreados);
    });

    // 8. Ordenar filas por incidencia promedio descendente
    const filasOrdenadas = Array.from(filasMap.values()).sort(
      (a, b) => b.incidenciaPromedioTotal - a.incidenciaPromedioTotal
    );

    // 9. Incidencia promedio por columna (lote), sobre la misma ventana de rondas:
    // árboles afectados por cualquier plaga (Beneficos ya excluidos) / árboles
    // monitoreados en las visitas de ese lote. Nota: como suma la afectación de
    // varias plagas distintas en la misma ronda, puede superar 100% cuando varias
    // plagas coinciden con incidencia alta a la vez.
    const lotesMap = new Map<string, { nombre: string; totalAfectados: number; rondasVistas: Set<string> }>();

    mapaAgrupado.forEach(celda => {
      if (!lotesMap.has(celda.loteId)) {
        lotesMap.set(celda.loteId, { nombre: celda.loteNombre, totalAfectados: 0, rondasVistas: new Set() });
      }

      const lote = lotesMap.get(celda.loteId)!;
      celda.monitoreos.forEach(m => {
        lote.totalAfectados += m.arboles_afectados || 0;
        lote.rondasVistas.add(m.ronda_id);
      });
    });

    // 10. Ordenar columnas por número de lote (orden numérico)
    const columnasOrdenadas = Array.from(lotesMap.entries())
      .map(([loteId, data]) => {
        let sumMonitoreados = 0;
        data.rondasVistas.forEach(rondaId => {
          sumMonitoreados += loteRondaTreeTotals.get(`${loteId}|${rondaId}`) || 0;
        });
        return {
          loteId,
          loteNombre: data.nombre,
          incidenciaPromedio: calcularIncidencia(data.totalAfectados, sumMonitoreados)
        };
      })
      .sort((a, b) => {
        const numA = parseInt(a.loteNombre.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.loteNombre.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });

    return {
      filas: filasOrdenadas,
      columnas: columnasOrdenadas,
      lotesInactivos: lotesInactivos.sort((a, b) => a.loteNombre.localeCompare(b.loteNombre))
    };
  }, [monitoreos, rondas, modoVisualizacion]);

  // ============================================
  // HANDLERS
  // ============================================

  const handleCeldaClick = (celda: CeldaMapaCalor) => {
    setCeldaSeleccionada(celda);
    setModalAbierto(true);
  };

  // ============================================
  // RENDER
  // ============================================

  if (datosMapaCalor.filas.length === 0 || datosMapaCalor.columnas.length === 0) {
    return (
      <div className="p-12">
        <div className="flex flex-col items-center justify-center text-gray-500">
          <AlertCircle className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg text-foreground">No hay datos disponibles</p>
          <p className="text-sm mt-2">No se encontraron monitoreos para el período seleccionado</p>
          {datosMapaCalor.lotesInactivos.length > 0 && (
            <p className="text-xs mt-2 text-gray-400">
              {datosMapaCalor.lotesInactivos.length} lote(s) ocultos por no tener monitoreos en los últimos {DIAS_VIGENCIA_LOTE} días: {datosMapaCalor.lotesInactivos.map(l => l.loteNombre).join(', ')}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* LEYENDA DE COLORES */}
      <div className="mb-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-primary" />
          <span className="font-medium text-foreground">Leyenda de Incidencia</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-100 border border-green-300 rounded"></div>
            <span className="text-sm">{'< 10%'} (Baja)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-yellow-100 border border-yellow-300 rounded"></div>
            <span className="text-sm">10-30% (Media)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-100 border border-red-300 rounded"></div>
            <span className="text-sm">{'≥30%'} (Alta)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-50 border border-gray-200 rounded"></div>
            <span className="text-sm">Sin datos</span>
          </div>
        </div>
        {datosMapaCalor.lotesInactivos.length > 0 && (
          <p className="text-xs text-gray-500 mt-3 pt-3 border-t border-gray-200">
            {datosMapaCalor.lotesInactivos.length} lote(s) ocultos por no tener monitoreos en los últimos {DIAS_VIGENCIA_LOTE} días: {datosMapaCalor.lotesInactivos.map(l => l.loteNombre).join(', ')}
          </p>
        )}
      </div>

      {/* TABLA DEL MAPA DE CALOR */}
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: '70vh' }}>
        <table className="w-full border-separate border-spacing-0 table-fixed" style={{ minWidth: `${200 + datosMapaCalor.columnas.length * 180}px` }}>
          <thead>
            <tr>
              <th className="p-3 border border-gray-300 text-left w-[200px]" style={{ backgroundColor: '#f0f4e8', position: 'sticky', left: 0, top: 0, zIndex: 30 }}>
                <div className="font-bold text-foreground">Plaga / Lote</div>
              </th>
              {datosMapaCalor.columnas.map(columna => (
                <th
                  key={columna.loteId}
                  className="p-3 border border-gray-300 text-center w-[180px]" style={{ backgroundColor: '#f0f4e8', position: 'sticky', top: 0, zIndex: 20 }}
                >
                  <div className="font-bold text-foreground text-sm truncate">{columna.loteNombre}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Prom: {Math.round(columna.incidenciaPromedio)}%
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datosMapaCalor.filas.map(fila => (
              <tr key={fila.plagaId}>
                <th className="p-3 border border-gray-300 text-left font-medium w-[200px]" style={{ backgroundColor: '#ffffff', position: 'sticky', left: 0, zIndex: 10 }}>
                  <div className="text-foreground">{fila.plagaNombre}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Prom: {Math.round(fila.incidenciaPromedioTotal)}%
                  </div>
                </th>
                {datosMapaCalor.columnas.map(columna => {
                  const celda = fila.celdas.get(columna.loteId) || null;
                  return (
                    <CeldaMultiple
                      key={`${fila.plagaId}-${columna.loteId}`}
                      celda={celda}
                      onClick={() => celda && handleCeldaClick(celda)}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL DE DETALLES */}
      <Dialog open={modalAbierto} onOpenChange={setModalAbierto}>
        <DialogContent size="xl">
          {celdaSeleccionada && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl">
                  {celdaSeleccionada.plagaNombre} - {celdaSeleccionada.loteNombre}
                </DialogTitle>
                <DialogDescription>
                  Incidencia promedio: {Math.round(celdaSeleccionada.incidenciaPromedio)}% •
                  {celdaSeleccionada.numeroMonitoreos} monitoreos registrados
                </DialogDescription>
              </DialogHeader>

              <DialogBody>
              <div className="mt-4">
                <h4 className="font-medium text-foreground mb-3">Detalle de Monitoreos</h4>
                <div className="space-y-2">
                  {celdaSeleccionada.monitoreos.map((m, index) => (
                    <div
                      key={m.id || index}
                      className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                    >
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Fecha:</span>
                          <p className="font-medium text-foreground">
                            {formatearFecha(m.fecha_monitoreo)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Sublote:</span>
                          <p className="font-medium text-foreground">
                            {m.sublotes?.nombre || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Incidencia:</span>
                          <p className="font-medium text-foreground">
                            {Math.round(parseFloat(String(m.incidencia)))}%
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Gravedad:</span>
                          <p className={`font-medium ${m.gravedad_texto === 'Alta' ? 'text-red-600' :
                              m.gravedad_texto === 'Media' ? 'text-yellow-600' :
                                'text-green-600'
                            }`}>
                            {m.gravedad_texto}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              </DialogBody>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

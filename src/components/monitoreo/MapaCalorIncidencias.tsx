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
  FilaMapaCalor
} from '../../types/monitoreo';
import { formatearFecha } from '../../utils/fechas';

// ============================================
// INTERFACES
// ============================================

interface MapaCalorIncidenciasProps {
  monitoreos: MonitoreoConRelaciones[];
  rangoSeleccionado: 'semana' | 'mes' | 'trimestre' | 'todo';
  modoVisualizacion: 'ultimo' | 'ultimos3' | 'ultimos6';
}

// ============================================
// UTILIDAD: DETERMINAR COLOR DE CELDA
// ============================================

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

  if (incidencia < 10) {
    return {
      bg: 'bg-green-100',
      text: 'text-green-800',
      border: 'border-green-300'
    };
  } else if (incidencia < 15) {
    return {
      bg: 'bg-yellow-100',
      text: 'text-yellow-800',
      border: 'border-yellow-300'
    };
  } else if (incidencia < 20) {
    return {
      bg: 'bg-orange-100',
      text: 'text-orange-800',
      border: 'border-orange-300'
    };
  } else {
    return {
      bg: 'bg-red-100',
      text: 'text-red-800',
      border: 'border-red-300'
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

function getArrowColor(prev: number, curr: number): string {
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

  const ocurrencias = (celda.ocurrencias || []).slice(-3);

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
                  <span className={`${colores.bg} ${colores.text} font-semibold text-sm px-2 py-0.5 rounded`}>
                    {Math.round(oc.incidencia)}%
                  </span>
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
                    {formatearFecha(oc.fecha)}: {Math.round(oc.incidencia)}%
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
  rangoSeleccionado,
  modoVisualizacion
}: MapaCalorIncidenciasProps) {
  const [celdaSeleccionada, setCeldaSeleccionada] = useState<CeldaMapaCalor | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  // ============================================
  // PROCESAMIENTO DE DATOS
  // ============================================

  const datosMapaCalor = useMemo((): DatosMapaCalor => {
    // 1. Agrupar monitoreos por combinación plaga-lote
    const mapaAgrupado = new Map<string, CeldaMapaCalor>();

    monitoreos.forEach(m => {
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

    // 2. Calcular incidencia promedio Y ocurrencias según modo
    mapaAgrupado.forEach(celda => {
      const totalAfectados = celda.monitoreos.reduce((s, m) => s + (m.arboles_afectados || 0), 0);
      const totalMonitoreados = celda.monitoreos.reduce((s, m) => s + (m.arboles_monitoreados || 0), 0);
      celda.incidenciaPromedio = totalMonitoreados > 0 ? (totalAfectados / totalMonitoreados) * 100 : 0;

      // Always keep at least 3 ocurrencias for trend arrow calculation
      const numOcurrencias = modoVisualizacion === 'ultimos6' ? 6 : 3;

      // Agrupar por fecha con tree counts para promedio ponderado
      const monitoreoPorFecha = new Map<string, { afectados: number; monitoreados: number }>();
      celda.monitoreos.forEach(m => {
        const fecha = typeof m.fecha_monitoreo === 'string'
          ? m.fecha_monitoreo
          : m.fecha_monitoreo.toISOString().split('T')[0];
        if (!monitoreoPorFecha.has(fecha)) {
          monitoreoPorFecha.set(fecha, { afectados: 0, monitoreados: 0 });
        }
        const entry = monitoreoPorFecha.get(fecha)!;
        entry.afectados += m.arboles_afectados || 0;
        entry.monitoreados += m.arboles_monitoreados || 0;
      });

      // Ordenar fechas y tomar las últimas N
      const fechasOrdenadas = Array.from(monitoreoPorFecha.keys()).sort();
      const fechasSeleccionadas = fechasOrdenadas.slice(-numOcurrencias);

      // Crear array de ocurrencias con incidencia ponderada
      celda.ocurrencias = fechasSeleccionadas.map(fecha => {
        const t = monitoreoPorFecha.get(fecha)!;
        return {
          fecha,
          incidencia: t.monitoreados > 0 ? (t.afectados / t.monitoreados) * 100 : 0
        };
      });
    });

    // 3. Agrupar por plaga (filas)
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

    // 4. Calcular incidencia promedio total por fila (plaga)
    filasMap.forEach(fila => {
      const celdasArray = Array.from(fila.celdas.values());
      const totalAfectados = celdasArray.reduce(
        (s, celda) => s + celda.monitoreos.reduce((s2, m) => s2 + (m.arboles_afectados || 0), 0), 0
      );
      const totalMonitoreados = celdasArray.reduce(
        (s, celda) => s + celda.monitoreos.reduce((s2, m) => s2 + (m.arboles_monitoreados || 0), 0), 0
      );
      fila.incidenciaPromedioTotal = totalMonitoreados > 0 ? (totalAfectados / totalMonitoreados) * 100 : 0;
    });

    // 5. Ordenar filas por incidencia promedio descendente
    const filasOrdenadas = Array.from(filasMap.values()).sort(
      (a, b) => b.incidenciaPromedioTotal - a.incidenciaPromedioTotal
    );

    // 6. Obtener columnas únicas (lotes) con incidencia promedio
    const lotesMap = new Map<string, { totalAfectados: number; totalMonitoreados: number; nombre: string }>();

    mapaAgrupado.forEach(celda => {
      if (!lotesMap.has(celda.loteId)) {
        lotesMap.set(celda.loteId, {
          totalAfectados: 0,
          totalMonitoreados: 0,
          nombre: celda.loteNombre
        });
      }

      const lote = lotesMap.get(celda.loteId)!;
      celda.monitoreos.forEach(m => {
        lote.totalAfectados += m.arboles_afectados || 0;
        lote.totalMonitoreados += m.arboles_monitoreados || 0;
      });
    });

    // 7. Ordenar columnas por número de lote (orden numérico)
    const columnasOrdenadas = Array.from(lotesMap.entries())
      .map(([loteId, data]) => ({
        loteId,
        loteNombre: data.nombre,
        incidenciaPromedio: data.totalMonitoreados > 0 ? (data.totalAfectados / data.totalMonitoreados) * 100 : 0
      }))
      .sort((a, b) => {
        const numA = parseInt(a.loteNombre.match(/\d+/)?.[0] || '0');
        const numB = parseInt(b.loteNombre.match(/\d+/)?.[0] || '0');
        return numA - numB;
      });

    return {
      filas: filasOrdenadas,
      columnas: columnasOrdenadas
    };
  }, [monitoreos, modoVisualizacion]);

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
            <span className="text-sm">10-15% (Media)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-orange-100 border border-orange-300 rounded"></div>
            <span className="text-sm">15-20% (Alta)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-100 border border-red-300 rounded"></div>
            <span className="text-sm">{'>20%'} (Crítica)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-50 border border-gray-200 rounded"></div>
            <span className="text-sm">Sin datos</span>
          </div>
        </div>
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

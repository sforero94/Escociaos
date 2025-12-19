import { useState, useMemo } from 'react';
import { AlertCircle, Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
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
// COMPONENTE PRINCIPAL
// ============================================

export function MapaCalorIncidencias({
  monitoreos,
  rangoSeleccionado
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

    // 2. Calcular incidencia promedio para cada celda
    mapaAgrupado.forEach(celda => {
      const sumaIncidencias = celda.monitoreos.reduce(
        (suma, m) => suma + parseFloat(String(m.incidencia)),
        0
      );
      celda.incidenciaPromedio = sumaIncidencias / celda.numeroMonitoreos;
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
      const sumaIncidencias = celdasArray.reduce(
        (suma, celda) => suma + celda.incidenciaPromedio,
        0
      );
      fila.incidenciaPromedioTotal = sumaIncidencias / celdasArray.length;
    });

    // 5. Ordenar filas por incidencia promedio descendente
    const filasOrdenadas = Array.from(filasMap.values()).sort(
      (a, b) => b.incidenciaPromedioTotal - a.incidenciaPromedioTotal
    );

    // 6. Obtener columnas únicas (lotes) con incidencia promedio
    const lotesMap = new Map<string, { sumaIncidencia: number; count: number; nombre: string }>();

    mapaAgrupado.forEach(celda => {
      if (!lotesMap.has(celda.loteId)) {
        lotesMap.set(celda.loteId, {
          sumaIncidencia: 0,
          count: 0,
          nombre: celda.loteNombre
        });
      }

      const lote = lotesMap.get(celda.loteId)!;
      lote.sumaIncidencia += celda.incidenciaPromedio;
      lote.count++;
    });

    // 7. Ordenar columnas por número de lote (orden numérico)
    const columnasOrdenadas = Array.from(lotesMap.entries())
      .map(([loteId, data]) => ({
        loteId,
        loteNombre: data.nombre,
        incidenciaPromedio: data.sumaIncidencia / data.count
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
  }, [monitoreos]);

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
          <p className="text-lg text-[#172E08]">No hay datos disponibles</p>
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
          <Info className="w-4 h-4 text-[#73991C]" />
          <span className="font-medium text-[#172E08]">Leyenda de Incidencia</span>
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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-3 bg-[#73991C]/10 border border-gray-300 text-left sticky left-0 z-10">
                <div className="font-bold text-[#172E08]">Plaga / Lote</div>
              </th>
              {datosMapaCalor.columnas.map(columna => (
                <th
                  key={columna.loteId}
                  className="p-3 bg-[#73991C]/10 border border-gray-300 text-center min-w-[100px]"
                >
                  <div className="font-bold text-[#172E08]">{columna.loteNombre}</div>
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
                <th className="p-3 bg-gray-50 border border-gray-300 text-left font-medium sticky left-0 z-10">
                  <div className="text-[#172E08]">{fila.plagaNombre}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Prom: {Math.round(fila.incidenciaPromedioTotal)}%
                  </div>
                </th>
                {datosMapaCalor.columnas.map(columna => {
                  const celda = fila.celdas.get(columna.loteId) || null;
                  return (
                    <Celda
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
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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

              <div className="mt-4">
                <h4 className="font-medium text-[#172E08] mb-3">Detalle de Monitoreos</h4>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {celdaSeleccionada.monitoreos.map((m, index) => (
                    <div
                      key={m.id || index}
                      className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                    >
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">Fecha:</span>
                          <p className="font-medium text-[#172E08]">
                            {formatearFecha(m.fecha_monitoreo)}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Sublote:</span>
                          <p className="font-medium text-[#172E08]">
                            {m.sublotes?.nombre || 'N/A'}
                          </p>
                        </div>
                        <div>
                          <span className="text-gray-600">Incidencia:</span>
                          <p className="font-medium text-[#172E08]">
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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

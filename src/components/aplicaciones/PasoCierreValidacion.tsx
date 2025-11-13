import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Package,
  BarChart3,
  Activity,
} from 'lucide-react';
import type {
  Aplicacion,
  MovimientoDiario,
  JornalesPorActividad,
  DetalleCierreLote,
  ComparacionProducto,
} from '../../types/aplicaciones';

interface PasoCierreValidacionProps {
  aplicacion: Aplicacion;
  movimientos: MovimientoDiario[];
  valorJornal: number;
  jornales: JornalesPorActividad;
  onDetallesLotesCalculados: (detalles: DetalleCierreLote[]) => void;
  onComparacionProductosCalculada: (comparacion: ComparacionProducto[]) => void;
  onRequiereAprobacionChange: (requiere: boolean) => void;
}

export function PasoCierreValidacion({
  aplicacion,
  movimientos,
  valorJornal,
  jornales,
  onDetallesLotesCalculados,
  onComparacionProductosCalculada,
  onRequiereAprobacionChange,
}: PasoCierreValidacionProps) {
  const [detallesLotes, setDetallesLotes] = useState<DetalleCierreLote[]>([]);
  const [comparacionProductos, setComparacionProductos] = useState<ComparacionProducto[]>([]);
  const [desviacionMaxima, setDesviacionMaxima] = useState<number>(0);

  useEffect(() => {
    calcularDetalles();
  }, [movimientos, valorJornal, jornales]);

  const calcularDetalles = () => {
    try {
      // Validar que existan los datos necesarios
      if (!aplicacion.mezclas || aplicacion.mezclas.length === 0) {
        console.warn('No hay mezclas configuradas en la aplicación');
        setComparacionProductos([]);
        setDetallesLotes([]);
        setDesviacionMaxima(0);
        onRequiereAprobacionChange(false);
        return;
      }

      if (
        !aplicacion.configuracion ||
        !aplicacion.configuracion.lotes_seleccionados ||
        aplicacion.configuracion.lotes_seleccionados.length === 0
      ) {
        console.warn('No hay lotes configurados en la aplicación');
        // Solo calcular productos sin lotes
        calcularSoloProductos();
        return;
      }

      calcularTodo();
    } catch (error) {
      console.error('Error en cálculos de validación:', error);
      setComparacionProductos([]);
      setDetallesLotes([]);
    }
  };

  const calcularSoloProductos = () => {
    // 1. CALCULAR COMPARACIÓN DE PRODUCTOS
    const productosMap = new Map<string, ComparacionProducto>();

    // Obtener cantidades planeadas
    aplicacion.mezclas.forEach((mezcla) => {
      mezcla.productos.forEach((producto) => {
        if (!productosMap.has(producto.producto_id)) {
          productosMap.set(producto.producto_id, {
            producto_id: producto.producto_id,
            producto_nombre: producto.producto_nombre,
            producto_unidad: producto.producto_unidad,
            cantidad_planeada: producto.cantidad_total_necesaria,
            cantidad_real: 0,
            diferencia: 0,
            porcentaje_desviacion: 0,
            costo_unitario: 0,
            costo_total: 0,
          });
        }
      });
    });

    console.log('📦 Productos map inicial (solo productos):', Array.from(productosMap.values()));

    // Sumar cantidades reales de movimientos
    movimientos.forEach((mov) => {
      const producto = productosMap.get(mov.producto_id);
      if (producto) {
        producto.cantidad_real += mov.cantidad_utilizada;
        // Actualizar costo unitario si está disponible
        if (mov.costo_unitario && producto.costo_unitario === 0) {
          producto.costo_unitario = mov.costo_unitario;
          console.log(`💰 Costo cargado para ${producto.producto_nombre}: $${mov.costo_unitario}`);
        }
      }
    });

    // Calcular diferencias y desviaciones
    const productosArray = Array.from(productosMap.values()).map((p) => {
      p.diferencia = p.cantidad_real - p.cantidad_planeada;
      p.porcentaje_desviacion =
        p.cantidad_planeada > 0 ? (p.diferencia / p.cantidad_planeada) * 100 : 0;
      // Calcular costo total con el precio unitario real
      p.costo_total = p.cantidad_real * (p.costo_unitario || 0);
      console.log(`📊 ${p.producto_nombre}: Cantidad=${p.cantidad_real} x Costo=$${p.costo_unitario} = Total=$${p.costo_total}`);
      return p;
    });

    console.log('✅ Productos calculados (solo productos):', productosArray);

    setComparacionProductos(productosArray);
    onComparacionProductosCalculada(productosArray);

    // Calcular desviación máxima
    const maxDesv = Math.max(...productosArray.map((p) => Math.abs(p.porcentaje_desviacion)));
    setDesviacionMaxima(maxDesv);
    onRequiereAprobacionChange(maxDesv > 20);

    setDetallesLotes([]);
    onDetallesLotesCalculados([]);
  };

  const calcularTodo = () => {
    // 1. CALCULAR COMPARACIÓN DE PRODUCTOS
    const productosMap = new Map<string, ComparacionProducto>();

    // Obtener cantidades planeadas
    aplicacion.mezclas.forEach((mezcla) => {
      mezcla.productos.forEach((producto) => {
        if (!productosMap.has(producto.producto_id)) {
          productosMap.set(producto.producto_id, {
            producto_id: producto.producto_id,
            producto_nombre: producto.producto_nombre,
            producto_unidad: producto.producto_unidad,
            cantidad_planeada: producto.cantidad_total_necesaria,
            cantidad_real: 0,
            diferencia: 0,
            porcentaje_desviacion: 0,
            costo_unitario: 0,
            costo_total: 0,
          });
        }
      });
    });

    // Sumar cantidades reales de movimientos
    movimientos.forEach((mov) => {
      const producto = productosMap.get(mov.producto_id);
      if (producto) {
        producto.cantidad_real += mov.cantidad_utilizada;
        // Actualizar costo unitario si está disponible
        if (mov.costo_unitario && producto.costo_unitario === 0) {
          producto.costo_unitario = mov.costo_unitario;
        }
      }
    });

    // Calcular diferencias y desviaciones
    const productosArray = Array.from(productosMap.values()).map((p) => {
      p.diferencia = p.cantidad_real - p.cantidad_planeada;
      p.porcentaje_desviacion =
        p.cantidad_planeada > 0 ? (p.diferencia / p.cantidad_planeada) * 100 : 0;
      // Calcular costo total con el precio unitario real
      p.costo_total = p.cantidad_real * (p.costo_unitario || 0);
      return p;
    });

    setComparacionProductos(productosArray);
    onComparacionProductosCalculada(productosArray);

    // Calcular desviación máxima
    const maxDesv = Math.max(...productosArray.map((p) => Math.abs(p.porcentaje_desviacion)));
    setDesviacionMaxima(maxDesv);
    onRequiereAprobacionChange(maxDesv > 20);

    // 2. CALCULAR DETALLES POR LOTE
    const totalJornales =
      jornales.aplicacion + jornales.mezcla + jornales.transporte + (jornales.otros || 0);

    const detalles: DetalleCierreLote[] = aplicacion.configuracion.lotes_seleccionados.map(
      (lote) => {
        // Buscar cálculos planeados
        const calculosLote = aplicacion.calculos.find((c) => c.lote_id === lote.lote_id);

        // Agrupar movimientos por lote
        const movimientosLote = movimientos.filter((m) => m.lote_id === lote.lote_id);

        // Sumar cantidades reales
        let litrosReales = 0;
        let kilosReales = 0;
        let canecasReales = 0;

        movimientosLote.forEach((mov) => {
          if (mov.producto_unidad === 'litros') {
            litrosReales += mov.cantidad_utilizada;
          } else if (mov.producto_unidad === 'kilos') {
            kilosReales += mov.cantidad_utilizada;
          }

          if (mov.numero_canecas_utilizadas) {
            canecasReales += mov.numero_canecas_utilizadas;
          }
        });

        // Calcular costos
        // Por ahora, distribuimos jornales proporcionalmente por número de árboles
        const proporcionArboles =
          lote.conteo_arboles.total /
          aplicacion.configuracion.lotes_seleccionados.reduce(
            (sum, l) => sum + l.conteo_arboles.total,
            0
          );

        const jornalesLote = Math.round(totalJornales * proporcionArboles);
        const costoManoObra = jornalesLote * valorJornal;

        // Costo de insumos (suma de productos usados en este lote)
        const costoInsumos = movimientosLote.reduce((sum, mov) => {
          const producto = productosArray.find((p) => p.producto_id === mov.producto_id);
          return sum + (producto?.costo_unitario || 0) * mov.cantidad_utilizada;
        }, 0);

        const costoTotal = costoInsumos + costoManoObra;
        const costoPorArbol =
          lote.conteo_arboles.total > 0 ? costoTotal / lote.conteo_arboles.total : 0;

        // Calcular desviaciones
        const desviacionCanecas =
          calculosLote?.numero_canecas && calculosLote.numero_canecas > 0
            ? ((canecasReales - calculosLote.numero_canecas) / calculosLote.numero_canecas) * 100
            : 0;

        const desviacionLitros =
          calculosLote?.litros_mezcla && calculosLote.litros_mezcla > 0
            ? ((litrosReales - calculosLote.litros_mezcla) / calculosLote.litros_mezcla) * 100
            : 0;

        const desviacionKilos =
          calculosLote?.kilos_totales && calculosLote.kilos_totales > 0
            ? ((kilosReales - calculosLote.kilos_totales) / calculosLote.kilos_totales) * 100
            : 0;

        // Calcular eficiencias
        const arbolesPorJornal = jornalesLote > 0 ? lote.conteo_arboles.total / jornalesLote : 0;
        const litrosPorArbol =
          lote.conteo_arboles.total > 0 ? litrosReales / lote.conteo_arboles.total : 0;
        const kilosPorArbol =
          lote.conteo_arboles.total > 0 ? kilosReales / lote.conteo_arboles.total : 0;

        return {
          lote_id: lote.lote_id,
          lote_nombre: lote.nombre,
          canecas_planeadas: calculosLote?.numero_canecas,
          litros_planeados: calculosLote?.litros_mezcla,
          kilos_planeados: calculosLote?.kilos_totales,
          canecas_reales: canecasReales > 0 ? canecasReales : undefined,
          litros_reales: litrosReales > 0 ? litrosReales : undefined,
          kilos_reales: kilosReales > 0 ? kilosReales : undefined,
          jornales: {
            aplicacion: Math.round(jornales.aplicacion * proporcionArboles),
            mezcla: Math.round(jornales.mezcla * proporcionArboles),
            transporte: Math.round(jornales.transporte * proporcionArboles),
            otros: Math.round((jornales.otros || 0) * proporcionArboles),
          },
          costo_insumos: costoInsumos,
          costo_mano_obra: costoManoObra,
          costo_total: costoTotal,
          costo_por_arbol: costoPorArbol,
          desviacion_canecas: canecasReales > 0 ? desviacionCanecas : undefined,
          desviacion_litros: litrosReales > 0 ? desviacionLitros : undefined,
          desviacion_kilos: kilosReales > 0 ? desviacionKilos : undefined,
          arboles_por_jornal: arbolesPorJornal,
          litros_por_arbol: litrosReales > 0 ? litrosPorArbol : undefined,
          kilos_por_arbol: kilosReales > 0 ? kilosPorArbol : undefined,
        };
      }
    );

    setDetallesLotes(detalles);
    onDetallesLotesCalculados(detalles);
  };

  const formatearNumero = (valor: number | undefined, decimales: number = 2): string => {
    if (valor === undefined) return '-';
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales,
    }).format(valor);
  };

  const formatearMoneda = (valor: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(valor);
  };

  const getColorDesviacion = (desviacion: number | undefined): string => {
    if (desviacion === undefined) return 'text-gray-600';
    const abs = Math.abs(desviacion);
    if (abs > 20) return 'text-red-600';
    if (abs > 10) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getIconoDesviacion = (desviacion: number | undefined) => {
    if (desviacion === undefined) return null;
    const abs = Math.abs(desviacion);
    if (abs > 20) return <AlertTriangle className="w-4 h-4" />;
    if (abs > 10) return <TrendingDown className="w-4 h-4" />;
    return <CheckCircle className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6">
      {/* TÍTULO */}
      <div>
        <h3 className="text-xl text-[#172E08] mb-2">Validación y Cálculos Automáticos</h3>
        <p className="text-[#4D240F]/70">
          Revisión de desviaciones, costos y eficiencias calculados automáticamente.
        </p>
      </div>

      {/* ALERTA DE APROBACIÓN */}
      {desviacionMaxima > 20 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-red-900 mb-2">⚠️ Aprobación de Gerencia Requerida</h4>
              <p className="text-red-800 text-sm mb-3">
                Se ha detectado una desviación superior al 20% en uno o más productos. Según las
                políticas de la empresa, este cierre requiere aprobación de gerencia antes de
                finalizar.
              </p>
              <div className="bg-red-100 rounded-lg p-3">
                <div className="text-xs text-red-700">Desviación máxima detectada:</div>
                <div className="text-2xl text-red-900">{formatearNumero(desviacionMaxima)}%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMPARACIÓN DE PRODUCTOS */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-[#73991C]/10 to-[#BFD97D]/10 border-b border-[#73991C]/20 p-4">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-[#73991C]" />
            <h4 className="text-[#172E08]">Comparación Planeado vs. Real por Producto</h4>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs text-[#4D240F] uppercase tracking-wider">
                  Producto
                </th>
                <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                  Planeado
                </th>
                <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                  Real
                </th>
                <th className="px-4 py-3 text-right text-xs text-[#4D240F] uppercase tracking-wider">
                  Diferencia
                </th>
                <th className="px-4 py-3 text-center text-xs text-[#4D240F] uppercase tracking-wider">
                  Desviación
                </th>
                <th className="px-4 py-3 text-center text-xs text-[#4D240F] uppercase tracking-wider">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {comparacionProductos.map((producto) => {
                const colorDesv = getColorDesviacion(producto.porcentaje_desviacion);
                const iconoDesv = getIconoDesviacion(producto.porcentaje_desviacion);
                const absDesv = Math.abs(producto.porcentaje_desviacion);

                return (
                  <tr key={producto.producto_id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-[#172E08]">{producto.producto_nombre}</div>
                      <div className="text-xs text-[#4D240F]/50">{producto.producto_unidad}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-[#4D240F]/70">
                      {formatearNumero(producto.cantidad_planeada)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-[#172E08]">
                      {formatearNumero(producto.cantidad_real)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      <span className={colorDesv}>
                        {producto.diferencia > 0 ? '+' : ''}
                        {formatearNumero(producto.diferencia)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 ${colorDesv}`}>
                        {producto.porcentaje_desviacion > 0 ? '+' : ''}
                        {formatearNumero(producto.porcentaje_desviacion)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs ${
                          absDesv > 20
                            ? 'bg-red-100 text-red-800'
                            : absDesv > 10
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {iconoDesv}
                        {absDesv > 20 ? 'Alta' : absDesv > 10 ? 'Media' : 'Normal'}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* DETALLES POR LOTE */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-blue-500/10 to-blue-400/10 border-b border-blue-200 p-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h4 className="text-[#172E08]">Detalles por Lote: Costos y Eficiencias</h4>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {detallesLotes.map((lote) => (
            <div
              key={lote.lote_id}
              className="border border-gray-200 rounded-xl overflow-hidden"
            >
              {/* Header del lote */}
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h5 className="text-[#172E08]">{lote.lote_nombre}</h5>
              </div>

              {/* Contenido del lote */}
              <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Costos */}
                  <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <DollarSign className="w-4 h-4 text-[#73991C]" />
                      <div className="text-xs text-[#4D240F]/70">Costo Total</div>
                    </div>
                    <div className="text-lg text-[#172E08]">
                      {formatearMoneda(lote.costo_total)}
                    </div>
                    <div className="text-xs text-[#4D240F]/50 mt-1">
                      {formatearMoneda(lote.costo_por_arbol)} / árbol
                    </div>
                  </div>

                  {/* Jornales */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-blue-600" />
                      <div className="text-xs text-blue-700">Jornales</div>
                    </div>
                    <div className="text-lg text-blue-900">
                      {lote.jornales.aplicacion +
                        lote.jornales.mezcla +
                        lote.jornales.transporte +
                        (lote.jornales.otros || 0)}
                    </div>
                    <div className="text-xs text-blue-700 mt-1">
                      {formatearNumero(lote.arboles_por_jornal || 0)} árb/jornal
                    </div>
                  </div>

                  {/* Desviación Litros/Kilos */}
                  {aplicacion.tipo === 'fumigacion' && lote.litros_reales && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-purple-600" />
                        <div className="text-xs text-purple-700">Litros</div>
                      </div>
                      <div className="text-sm text-purple-900">
                        {formatearNumero(lote.litros_reales)} /{' '}
                        {formatearNumero(lote.litros_planeados)}
                      </div>
                      <div
                        className={`text-xs mt-1 ${getColorDesviacion(lote.desviacion_litros)}`}
                      >
                        Desv: {formatearNumero(lote.desviacion_litros)}%
                      </div>
                    </div>
                  )}

                  {aplicacion.tipo === 'fertilizacion' && lote.kilos_reales && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-purple-600" />
                        <div className="text-xs text-purple-700">Kilos</div>
                      </div>
                      <div className="text-sm text-purple-900">
                        {formatearNumero(lote.kilos_reales)} /{' '}
                        {formatearNumero(lote.kilos_planeados)}
                      </div>
                      <div className={`text-xs mt-1 ${getColorDesviacion(lote.desviacion_kilos)}`}>
                        Desv: {formatearNumero(lote.desviacion_kilos)}%
                      </div>
                    </div>
                  )}

                  {/* Eficiencias */}
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-orange-600" />
                      <div className="text-xs text-orange-700">Eficiencia</div>
                    </div>
                    {lote.litros_por_arbol && (
                      <div className="text-sm text-orange-900">
                        {formatearNumero(lote.litros_por_arbol)} L/árbol
                      </div>
                    )}
                    {lote.kilos_por_arbol && (
                      <div className="text-sm text-orange-900">
                        {formatearNumero(lote.kilos_por_arbol)} kg/árbol
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* INSTRUCCIÓN */}
      {desviacionMaxima <= 20 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-green-900">
              <strong>Validación exitosa</strong>
            </p>
            <p className="text-green-800 text-sm mt-1">
              Las desviaciones están dentro del rango aceptable. Puedes proceder al paso final para
              confirmar el cierre.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-yellow-900">
              <strong>Revisa las desviaciones altas</strong>
            </p>
            <p className="text-yellow-800 text-sm mt-1">
              Puedes continuar para ver el resumen final, pero recuerda que se necesitará
              aprobación de gerencia para completar el cierre.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
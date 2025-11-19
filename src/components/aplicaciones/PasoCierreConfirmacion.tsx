import {
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  Package,
  FileText,
  CheckCircle,
  AlertTriangle,
  Download,
} from 'lucide-react';
import type {
  Aplicacion,
  JornalesPorActividad,
  DetalleCierreLote,
  ComparacionProducto,
} from '../../types/aplicaciones';

interface PasoCierreConfirmacionProps {
  aplicacion: Aplicacion;
  fechaInicio: string;
  fechaFinal: string;
  diasAplicacion: number;
  valorJornal: number;
  jornales: JornalesPorActividad;
  detallesLotes: DetalleCierreLote[];
  comparacionProductos: ComparacionProducto[];
  observaciones: {
    generales: string;
    meteorologicas: string;
    problemas: string;
    ajustes: string;
  };
  requiereAprobacion: boolean;
}

export function PasoCierreConfirmacion({
  aplicacion,
  fechaInicio,
  fechaFinal,
  diasAplicacion,
  valorJornal,
  jornales,
  detallesLotes,
  comparacionProductos,
  observaciones,
  requiereAprobacion,
}: PasoCierreConfirmacionProps) {
  const totalJornales =
    jornales.aplicacion + jornales.mezcla + jornales.transporte + (jornales.otros || 0);

  const costoManoObraTotal = totalJornales * valorJornal;
  const costoInsumosTotal = detallesLotes.reduce((sum, lote) => sum + lote.costo_insumos, 0);
  const costoTotal = costoManoObraTotal + costoInsumosTotal;

  const totalArboles =
    aplicacion.configuracion?.lotes_seleccionados?.reduce(
      (sum, lote) => sum + lote.conteo_arboles.total,
      0
    ) || 0;

  const costoPorArbol = totalArboles > 0 ? costoTotal / totalArboles : 0;
  const arbolesPorJornal = totalJornales > 0 ? totalArboles / totalJornales : 0;

  const formatearMoneda = (valor: number): string => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(valor);
  };

  const formatearNumero = (valor: number, decimales: number = 2): string => {
    return new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: decimales,
      maximumFractionDigals: decimales,
    }).format(valor);
  };

  const formatearFecha = (fecha: string): string => {
    return new Date(fecha).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const desviacionesAltas = comparacionProductos.filter(
    (p) => Math.abs(p.porcentaje_desviacion) > 20
  );

  return (
    <div className="space-y-6">
      {/* TÍTULO */}
      <div>
        <h3 className="text-xl text-[#172E08] mb-2">Confirmación de Cierre</h3>
        <p className="text-[#4D240F]/70">
          Revisa el resumen completo antes de finalizar el cierre de la aplicación.
        </p>
      </div>

      {/* SECCIÓN 1: INFORMACIÓN GENERAL */}
      <div className="bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 border border-[#73991C]/20 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-[#73991C]/10 rounded-lg">
            <Calendar className="w-5 h-5 text-[#73991C]" />
          </div>
          <h4 className="text-[#172E08]">Información General</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-[#4D240F]/70 mb-1">Nombre</div>
            <div className="text-sm text-[#172E08]">{aplicacion.nombre}</div>
          </div>
          <div>
            <div className="text-xs text-[#4D240F]/70 mb-1">Tipo</div>
            <div className="text-sm text-[#172E08] capitalize">{aplicacion.tipo}</div>
          </div>
          <div>
            <div className="text-xs text-[#4D240F]/70 mb-1">Fecha Inicio</div>
            <div className="text-sm text-[#172E08]">{formatearFecha(fechaInicio)}</div>
          </div>
          <div>
            <div className="text-xs text-[#4D240F]/70 mb-1">Fecha Final</div>
            <div className="text-sm text-[#172E08]">{formatearFecha(fechaFinal)}</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-[#73991C]/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-[#4D240F]/70 mb-1">Días de Ejecución</div>
              <div className="text-2xl text-[#73991C]">{diasAplicacion}</div>
            </div>
            <div>
              <div className="text-xs text-[#4D240F]/70 mb-1">Lotes Tratados</div>
              <div className="text-2xl text-[#73991C]">{detallesLotes.length}</div>
            </div>
            <div>
              <div className="text-xs text-[#4D240F]/70 mb-1">Árboles Tratados</div>
              <div className="text-2xl text-[#73991C]">{totalArboles.toLocaleString('es-CO')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 2: COSTOS */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <h4 className="text-[#172E08]">Resumen de Costos</h4>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Costos Detallados */}
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-sm text-[#4D240F]/70">Costo de Insumos</span>
                <span className="text-sm text-[#172E08]">
                  {formatearMoneda(costoInsumosTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-200">
                <span className="text-sm text-[#4D240F]/70">
                  Mano de Obra ({totalJornales} jornales × {formatearMoneda(valorJornal)})
                </span>
                <span className="text-sm text-[#172E08]">
                  {formatearMoneda(costoManoObraTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 bg-gradient-to-br from-[#73991C]/10 to-[#BFD97D]/10 px-4 rounded-lg">
                <span className="text-[#172E08]">Costo Total</span>
                <span className="text-xl text-[#73991C]">{formatearMoneda(costoTotal)}</span>
              </div>
            </div>

            {/* Costos por Unidad */}
            <div className="space-y-3">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="text-xs text-purple-700 mb-1">Costo por Árbol</div>
                <div className="text-2xl text-purple-900">{formatearMoneda(costoPorArbol)}</div>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                <div className="text-xs text-orange-700 mb-1">Árboles por Jornal</div>
                <div className="text-2xl text-orange-900">{formatearNumero(arbolesPorJornal)}</div>
              </div>
            </div>
          </div>

          {/* Distribución de Jornales */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h5 className="text-sm text-[#4D240F]/70 mb-3">Distribución de Jornales</h5>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-[#4D240F]/70 mb-1">Aplicación</div>
                <div className="text-lg text-[#172E08]">{jornales.aplicacion}</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-[#4D240F]/70 mb-1">Mezcla</div>
                <div className="text-lg text-[#172E08]">{jornales.mezcla}</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-[#4D240F]/70 mb-1">Transporte</div>
                <div className="text-lg text-[#172E08]">{jornales.transporte}</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-[#4D240F]/70 mb-1">Otros</div>
                <div className="text-lg text-[#172E08]">{jornales.otros || 0}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN 3: DETALLE POR LOTE */}
      {detallesLotes.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-[#73991C]/10 border-b border-[#73991C]/20 px-6 py-4">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-[#73991C]" />
              <h4 className="text-[#172E08]">Detalle por Lote</h4>
            </div>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {detallesLotes.map((lote) => (
                <div
                  key={lote.lote_id}
                  className="border border-gray-200 rounded-lg p-4 bg-gradient-to-br from-white to-gray-50"
                >
                  <h5 className="text-sm text-[#172E08] font-medium mb-3">
                    {lote.lote_nombre}
                  </h5>

                  <div className="space-y-2">
                    {/* Canecas/Bultos según el tipo de aplicación */}
                    {aplicacion.tipo === 'fumigacion' && lote.canecas_planeadas !== undefined && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-[#4D240F]/70">Canecas:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[#172E08]">
                            {formatearNumero(lote.canecas_planeadas || 0, 1)} planeadas
                          </span>
                          <span className="text-[#4D240F]/40">→</span>
                          <span className="text-[#73991C] font-medium">
                            {formatearNumero(lote.canecas_reales || 0, 1)} reales
                          </span>
                        </div>
                      </div>
                    )}

                    {aplicacion.tipo === 'fertilizacion' && lote.kilos_planeados !== undefined && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-[#4D240F]/70">Bultos (kg):</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[#172E08]">
                            {formatearNumero(lote.kilos_planeados || 0, 1)} planeados
                          </span>
                          <span className="text-[#4D240F]/40">→</span>
                          <span className="text-[#73991C] font-medium">
                            {formatearNumero(lote.kilos_reales || 0, 1)} reales
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Litros */}
                    {lote.litros_planeados !== undefined && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-[#4D240F]/70">Litros:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[#172E08]">
                            {formatearNumero(lote.litros_planeados || 0, 1)} planeados
                          </span>
                          <span className="text-[#4D240F]/40">→</span>
                          <span className="text-[#73991C] font-medium">
                            {formatearNumero(lote.litros_reales || 0, 1)} reales
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Jornales si existen */}
                    {lote.jornales && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="text-xs text-[#4D240F]/70 mb-2">Jornales utilizados:</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {lote.jornales.aplicacion > 0 && (
                            <div className="flex justify-between">
                              <span className="text-[#4D240F]/60">Aplicación:</span>
                              <span className="text-[#172E08] font-medium">
                                {lote.jornales.aplicacion}
                              </span>
                            </div>
                          )}
                          {lote.jornales.mezcla > 0 && (
                            <div className="flex justify-between">
                              <span className="text-[#4D240F]/60">Mezcla:</span>
                              <span className="text-[#172E08] font-medium">
                                {lote.jornales.mezcla}
                              </span>
                            </div>
                          )}
                          {lote.jornales.transporte > 0 && (
                            <div className="flex justify-between">
                              <span className="text-[#4D240F]/60">Transporte:</span>
                              <span className="text-[#172E08] font-medium">
                                {lote.jornales.transporte}
                              </span>
                            </div>
                          )}
                          {(lote.jornales.otros || 0) > 0 && (
                            <div className="flex justify-between">
                              <span className="text-[#4D240F]/60">Otros:</span>
                              <span className="text-[#172E08] font-medium">
                                {lote.jornales.otros}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Costo por árbol */}
                    <div className="mt-3 pt-3 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-xs text-[#4D240F]/70">Costo por árbol:</span>
                      <span className="text-sm text-[#73991C] font-medium">
                        {formatearMoneda(lote.costo_por_arbol || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECCIÓN 4: DESVIACIONES */}
      {desviacionesAltas.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-red-900 mb-3">Productos con Desviación Alta (&gt; 20%)</h4>
              <div className="space-y-2">
                {desviacionesAltas.map((producto) => (
                  <div
                    key={producto.producto_id}
                    className="bg-white border border-red-200 rounded-lg p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm text-[#172E08]">{producto.producto_nombre}</div>
                      <div className="text-xs text-[#4D240F]/70">
                        Planeado: {formatearNumero(producto.cantidad_planeada)}{' '}
                        {producto.producto_unidad} → Real:{' '}
                        {formatearNumero(producto.cantidad_real)} {producto.producto_unidad}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg text-red-600">
                        {producto.porcentaje_desviacion > 0 ? '+' : ''}
                        {formatearNumero(producto.porcentaje_desviacion)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECCIÓN 5: OBSERVACIONES */}
      {(observaciones.generales ||
        observaciones.meteorologicas ||
        observaciones.problemas ||
        observaciones.ajustes) && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-purple-50 border-b border-purple-200 px-6 py-4">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-purple-600" />
              <h4 className="text-[#172E08]">Observaciones</h4>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {observaciones.generales && (
              <div>
                <div className="text-xs text-[#4D240F]/70 mb-1">Observaciones Generales</div>
                <div className="text-sm text-[#172E08] bg-gray-50 rounded-lg p-3">
                  {observaciones.generales}
                </div>
              </div>
            )}

            {observaciones.meteorologicas && (
              <div>
                <div className="text-xs text-[#4D240F]/70 mb-1">Condiciones Meteorológicas</div>
                <div className="text-sm text-[#172E08] bg-gray-50 rounded-lg p-3">
                  {observaciones.meteorologicas}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {observaciones.problemas && (
                <div>
                  <div className="text-xs text-[#4D240F]/70 mb-1">Problemas Encontrados</div>
                  <div className="text-sm text-[#172E08] bg-red-50 border border-red-200 rounded-lg p-3">
                    {observaciones.problemas}
                  </div>
                </div>
              )}

              {observaciones.ajustes && (
                <div>
                  <div className="text-xs text-[#4D240F]/70 mb-1">Ajustes Realizados</div>
                  <div className="text-sm text-[#172E08] bg-green-50 border border-green-200 rounded-lg p-3">
                    {observaciones.ajustes}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ALERTA FINAL */}
      {requiereAprobacion ? (
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-yellow-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-yellow-900 mb-2">Aprobación de Gerencia Pendiente</h4>
              <p className="text-yellow-800 text-sm">
                Esta aplicación tiene desviaciones superiores al 20% y requiere aprobación de
                gerencia antes de ser cerrada definitivamente. El cierre quedará en estado
                "Pendiente de Aprobación" hasta que un usuario con permisos de gerencia lo apruebe.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h4 className="text-green-900 mb-2">Listo para Cerrar</h4>
              <p className="text-green-800 text-sm mb-4">
                Todos los datos han sido validados y las desviaciones están dentro del rango
                aceptable. Al confirmar:
              </p>
              <ul className="text-green-800 text-sm space-y-1 list-disc list-inside">
                <li>Se actualizará el estado de la aplicación a "Cerrada"</li>
                <li>Se registrará la fecha de cierre</li>
                <li>Se guardarán todos los cálculos y observaciones</li>
                <li>Se generará un reporte de cierre para auditoría</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* BOTÓN DE EXPORTAR (FUTURO) */}
      <div className="border-t border-gray-200 pt-4">
        <button
          disabled
          className="w-full px-6 py-3 border-2 border-dashed border-gray-300 text-[#4D240F]/50 rounded-lg hover:bg-gray-50 transition-all flex items-center justify-center gap-2 cursor-not-allowed"
        >
          <Download className="w-5 h-5" />
          Exportar Reporte de Cierre (Próximamente)
        </button>
      </div>
    </div>
  );
}